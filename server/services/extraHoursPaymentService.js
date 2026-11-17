const mongoose = require('mongoose');
const Request = require('../models/ExtraHoursRequest');
const Payment = require('../models/ExtraHoursPayment');
const Student = require('../models/Student');
const Wallet = require('../models/Wallet');
const { recordTransaction } = require('./walletService');
const { prepareActivation, applyActivation } = require('./extraHoursActivationService');
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const generationFilter = (payment) => payment.checkoutGeneration ? { checkoutGeneration: payment.checkoutGeneration } : { $or: [{ checkoutGeneration: 0 }, { checkoutGeneration: { $exists: false } }] };
async function atomic(action) {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') throw fail('Payments require MongoDB configured as a replica set (or Atlas). No payment was taken.', 503);
  return mongoose.connection.transaction(action);
}
function stripeClient() {
  if (!/^(sk_test_|rk_test_|rkcs_test_)/.test(process.env.STRIPE_SECRET_KEY || '')) throw fail('Stripe test payments are not configured. Ask the administrator to configure a test-mode key.', 503);
  return require('stripe')(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 20000 });
}
async function owned(requestId, studentId, session) {
  const row = await Request.findOne({ _id: requestId, student: studentId, decision: 'Approved' }).session(session).lean();
  if (!row) throw fail('Approved extra-hours request not found.', 404);
  return row;
}
function payable(row) {
  if (row.settlementStatus !== 'Awaiting Payment Choice' || row.settlementOption != null || row.activatedAt) throw fail('This request is no longer awaiting payment. Refresh to see its status.');
}
async function lockStudent(studentId, session) {
  const result = await Student.updateOne({ _id: studentId, isActive: true, studentType: 'Advising Student' }, { $inc: { __v: 1 } }, { session });
  if (!result.matchedCount) throw fail('An active Advising Student account is required.', 403);
}
async function finish(request, payment, plan, actor, session) {
  const activation = await applyActivation(request, plan, session);
  const now = new Date();
  await Payment.updateOne({ _id: payment._id }, { $set: { status: 'Succeeded', paidAt: now } }, { session });
  const result = await Request.updateOne({ _id: request._id, settlementStatus: 'Awaiting Payment Choice', __v: request.__v }, {
    $set: { settlementStatus: 'Paid', settlementOption: payment.method, settlementPreference: 'Pay Now', paymentReference: payment.reference,
      activatedAt: now, activatedHours: request.requestedHours, activation }, $inc: { __v: 1 },
    $push: { history: { action: 'Paid', actor, at: now, note: `${payment.method}: ${payment.reference}` } },
  }, { session });
  if (!result.modifiedCount) throw fail('The request changed during payment.');
  return { message: 'Payment completed. Your approved extra hours and courses are active.', paymentReference: payment.reference };
}
async function payWallet(requestId, studentId, actor) {
  return atomic(async (session) => {
    const row = await owned(requestId, studentId, session);
    if (row.settlementStatus === 'Paid' && row.settlementOption === 'Wallet') return { message: 'This request has already been paid.', paymentReference: row.paymentReference };
    payable(row);
    if (row.gatewayAttempt) throw fail('A Stripe checkout already exists. Complete or check that checkout before using another payment method.');
    await lockStudent(studentId, session);
    const wallet = await Wallet.findOne({ student: studentId }).session(session).lean();
    if (!wallet || wallet.currency !== row.currency || wallet.balance < row.totalCost) throw fail('Insufficient wallet balance for the full approved amount.', 422);
    const plan = await prepareActivation(row, session);
    const [payment] = await Payment.create([{ request: row._id, student: studentId, method: 'Wallet', amount: row.totalCost, currency: row.currency }], { session });
    await recordTransaction(studentId, { type: 'Payment', amount: row.totalCost, requestReference: row.reference, paymentReference: payment.reference, description: 'Extra-hours payment' }, { session });
    return finish(row, payment, plan, actor, session);
  });
}
async function startCheckout(requestId, studentId, retry = false) {
  const stripe = stripeClient();
  const origin = process.env.PAYMENT_APP_ORIGIN || 'http://localhost:5173';
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw fail('Configure PAYMENT_APP_ORIGIN as the frontend origin.', 503);
  if (retry) {
    const previous = await Payment.findOne({ request: requestId, student: studentId, method: 'Gateway' }).lean();
    if (!previous) throw fail('No Stripe payment exists to retry.', 404);
    if (previous.status === 'Pending' && previous.stripeSessionId) await confirmCheckout(previous._id, studentId);
  }
  const payment = await atomic(async (session) => {
    const row = await owned(requestId, studentId, session);
    const existing = await Payment.findOne({ request: row._id }).session(session).lean();
    if (retry && existing && ['Failed', 'Cancelled'].includes(existing.status)) {
      if (!['Failed', 'Cancelled'].includes(row.settlementStatus) || row.activatedAt || String(row.gatewayAttempt) !== String(existing._id)) throw fail('This request cannot be retried. Refresh to see its current status.');
      if (existing.amount !== row.totalCost || existing.currency !== row.currency) throw fail('The approved price changed. Ask your Advisor for an updated request.');
      await lockStudent(studentId, session);
      await prepareActivation(row, session);
      const generation = (existing.checkoutGeneration || 0) + 1;
      const updated = await Payment.findOneAndUpdate({ _id: existing._id, status: existing.status, ...generationFilter(existing) }, {
        $set: { status: 'Pending', stripeSessionId: null, stripePaymentIntent: null, checkoutGeneration: generation },
        $push: { retiredSessions: { sessionId: existing.stripeSessionId, generation: generation - 1, status: existing.status, closedAt: existing.closedAt || new Date() } },
      }, { new: true, session }).lean();
      if (!updated) throw fail('Another retry is already in progress. Refresh and continue its checkout.');
      const reopened = await Request.updateOne({ _id: row._id, __v: row.__v }, { $set: { settlementStatus: 'Awaiting Payment Choice', settlementOption: null, settlementPreference: 'Pay Now' }, $inc: { __v: 1 },
        $push: { history: { action: 'StripePaymentRetried', note: `${existing.reference}: attempt ${generation + 1}` } } }, { session });
      if (!reopened.modifiedCount) throw fail('The request changed while retrying. Refresh to see its status.');
      return updated;
    }
    payable(row);
    if (existing) {
      if (existing.method !== 'Gateway' || existing.status !== 'Pending') throw fail('A payment for this request is already recorded.');
      return existing;
    }
    await lockStudent(studentId, session);
    await prepareActivation(row, session); // Fail before opening Checkout if slots/eligibility are invalid.
    const [created] = await Payment.create([{ request: row._id, student: studentId, method: 'Gateway', amount: row.totalCost, currency: row.currency }], { session });
    await Request.updateOne({ _id: row._id }, { $set: { gatewayAttempt: created._id, settlementPreference: 'Pay Now' }, $inc: { __v: 1 } }, { session });
    return created.toObject();
  });
  const checkout = payment.stripeSessionId ? await stripe.checkout.sessions.retrieve(payment.stripeSessionId) : await stripe.checkout.sessions.create({
    mode: 'payment', allowed_payment_method_types: ['card'], client_reference_id: String(payment._id),
    metadata: { paymentId: String(payment._id), requestId: String(payment.request), generation: String(payment.checkoutGeneration || 0) },
    payment_intent_data: { metadata: { paymentId: String(payment._id), requestId: String(payment.request), generation: String(payment.checkoutGeneration || 0) } },
    line_items: [{ price_data: { currency: 'egp', unit_amount: Math.round(payment.amount * 100), product_data: { name: `Extra-hours payment ${payment.reference}` } }, quantity: 1 }],
    success_url: `${origin}/my-extra-hours-requests?checkout=${payment._id}`,
    cancel_url: `${origin}/my-extra-hours-requests?checkout=${payment._id}&cancelled=1&attempt=${payment.checkoutGeneration || 0}`,
  }, { idempotencyKey: `extra-hours-checkout-${payment._id}${payment.checkoutGeneration ? `-${payment.checkoutGeneration}` : ''}` });
  if (checkout.livemode || !checkout.id.startsWith('cs_test_')) throw fail('Only Stripe test sessions are permitted.', 502);
  const stored = await Payment.updateOne({ _id: payment._id, status: 'Pending', ...generationFilter(payment) }, { $set: { stripeSessionId: checkout.id } });
  if (!stored.matchedCount) throw fail('Checkout changed while opening. Refresh to see its status.');
  if (checkout.payment_status === 'paid') return { paymentId: String(payment._id), url: null };
  if (checkout.status !== 'open' || !checkout.url || new URL(checkout.url).hostname !== 'checkout.stripe.com') throw fail('This Checkout session is no longer open.');
  return { paymentId: String(payment._id), url: checkout.url };
}
async function markCheckoutClosed(payment, checkout, status) {
  return atomic(async (session) => {
    const current = await Payment.findById(payment._id).session(session).lean();
    if (current && ['Failed', 'Cancelled'].includes(current.status) && current.stripeSessionId === checkout.id && (current.checkoutGeneration || 0) === (payment.checkoutGeneration || 0)) return { message: `Stripe payment ${current.status.toLowerCase()}. You can retry it. No hours were activated.` };
    if (!current || current.status !== 'Pending' || current.stripeSessionId !== checkout.id || (current.checkoutGeneration || 0) !== (payment.checkoutGeneration || 0)) return { message: 'Checkout already changed. Refresh to see the current status.' };
    const row = await owned(payment.request, payment.student, session);
    if (row.settlementStatus !== 'Awaiting Payment Choice' || row.activatedAt || String(row.gatewayAttempt) !== String(payment._id)) return { message: 'The request is already finalized. Refresh to see its status.' };
    await Payment.updateOne({ _id: payment._id }, { $set: { status, closedAt: new Date() } }, { session });
    const closed = await Request.updateOne({ _id: row._id, __v: row.__v }, { $set: { settlementStatus: status }, $inc: { __v: 1 },
      $push: { history: { action: `StripePayment${status}`, note: `${payment.reference}: attempt ${(payment.checkoutGeneration || 0) + 1}` } } }, { session });
    if (!closed.modifiedCount) throw fail('The request changed while checking the checkout. Refresh to see its status.');
    return { message: `Stripe payment ${status.toLowerCase()}. You can retry it. No hours were activated.` };
  });
}
async function inspectUnpaidCheckout(payment, checkout, stripe, cancel = false) {
  let intent = null;
  if (typeof checkout.payment_intent === 'string') {
    intent = await stripe.paymentIntents.retrieve(checkout.payment_intent);
    if (intent.livemode || intent.amount !== Math.round(payment.amount * 100) || intent.currency !== 'egp') throw fail('Stripe payment intent does not match the approved amount.', 502);
    if (['processing', 'requires_capture', 'succeeded'].includes(intent.status)) return { message: 'Stripe is still processing this payment. Check its status before retrying; no new checkout was created.' };
  }
  const failed = Boolean(intent?.last_payment_error) && intent.status === 'requires_payment_method';
  if (checkout.status === 'open' && (cancel || failed)) {
    // Expiring an open session prevents it from later charging after a retry.
    try { await stripe.checkout.sessions.expire(checkout.id); }
    catch { /* Re-read: an expiry call may race successful payment or timeout. */ }
    checkout = await stripe.checkout.sessions.retrieve(checkout.id);
    if (checkout.payment_status === 'paid') return confirmCheckout(payment._id, payment.student);
    if (checkout.status !== 'expired') throw fail('Stripe checkout could not be closed safely. Check the payment before retrying.', 503);
  }
  if (checkout.status === 'expired' || (checkout.status === 'complete' && intent && ['requires_payment_method', 'canceled'].includes(intent.status))) {
    return markCheckoutClosed(payment, checkout, !cancel && (failed || checkout.status === 'complete') ? 'Failed' : 'Cancelled');
  }
  return { message: 'Payment is not confirmed. No hours have been activated.' };
}
async function cancelCheckout(paymentId, studentId, generation) {
  const payment = await Payment.findOne({ _id: paymentId, student: studentId, method: 'Gateway' }).lean();
  if (!payment) throw fail('Payment not found.', 404);
  if ((payment.checkoutGeneration || 0) !== generation) return { message: 'This cancellation belongs to an earlier attempt. The current checkout was not changed.' };
  if (payment.status !== 'Pending') return confirmCheckout(paymentId, studentId);
  if (!payment.stripeSessionId) throw fail('Checkout is not ready yet. Try opening it again.');
  const stripe = stripeClient(), checkout = await stripe.checkout.sessions.retrieve(payment.stripeSessionId);
  if (checkout.livemode || checkout.id !== payment.stripeSessionId || checkout.metadata?.paymentId !== String(payment._id) || checkout.metadata?.requestId !== String(payment.request) || checkout.amount_total !== Math.round(payment.amount * 100) || checkout.currency !== 'egp') throw fail('Stripe checkout details do not match this payment.', 502);
  if (checkout.payment_status === 'paid') return confirmCheckout(paymentId, studentId);
  return inspectUnpaidCheckout(payment, checkout, stripe, true);
}
async function confirmIntentFailure(paymentId, intentId, generation) {
  const payment = await Payment.findById(paymentId).lean();
  if (!payment || payment.method !== 'Gateway' || payment.status !== 'Pending' || (payment.checkoutGeneration || 0) !== generation) return { message: 'Earlier payment event ignored.' };
  if (!payment.stripeSessionId) throw fail('Checkout reconciliation is not ready.', 503);
  const checkout = await stripeClient().checkout.sessions.retrieve(payment.stripeSessionId);
  if (checkout.payment_intent !== intentId) return { message: 'Earlier payment intent ignored.' };
  return confirmCheckout(paymentId);
}
async function confirmCheckout(paymentId, studentId = null, verifiedSessionId = null) {
  const stripe = stripeClient();
  const payment = await Payment.findOne({ _id: paymentId, ...(studentId ? { student: studentId } : {}), method: 'Gateway' }).lean();
  if (!payment) throw fail('Payment not found.', 404);
  if (payment.status === 'Succeeded') return { message: 'Payment completed and extra hours activated.', paymentReference: payment.reference };
  if (payment.status === 'Refunded') return { message: 'Payment was refunded because the request could not be activated.' };
  if (verifiedSessionId && payment.retiredSessions?.some((entry) => entry.sessionId === verifiedSessionId)) return { message: 'An earlier checkout is already closed. The current checkout was not changed.' };
  if (['Failed', 'Cancelled'].includes(payment.status)) return { message: `Stripe payment ${payment.status.toLowerCase()}. You can retry it. No hours were activated.` };
  const sessionId = payment.stripeSessionId || verifiedSessionId;
  if (!sessionId) throw fail('Checkout has not been created yet. Try opening Stripe checkout again.');
  const checkout = await stripe.checkout.sessions.retrieve(sessionId);
  if (checkout.livemode || checkout.mode !== 'payment' || checkout.metadata?.paymentId !== String(payment._id) || checkout.metadata?.requestId !== String(payment.request) || checkout.amount_total !== Math.round(payment.amount * 100) || checkout.currency !== 'egp') throw fail('Stripe payment details do not match the approved amount.', 502);
  if (Number(checkout.metadata?.generation || 0) !== (payment.checkoutGeneration || 0)) throw fail('This event belongs to a different checkout attempt.', 409);
  if (!payment.stripeSessionId) await Payment.updateOne({ _id: payment._id, stripeSessionId: null, status: 'Pending', ...generationFilter(payment) }, { $set: { stripeSessionId: checkout.id } });
  if (checkout.payment_status !== 'paid') return inspectUnpaidCheckout(payment, checkout, stripe);
  if (!checkout.payment_intent || typeof checkout.payment_intent !== 'string') throw fail('Stripe payment reference is missing.', 502);
  try {
    return await atomic(async (session) => {
      const current = await Payment.findById(payment._id).session(session).lean();
      if (current.status === 'Succeeded') return { message: 'Payment already completed.', paymentReference: current.reference };
      if (current.status !== 'Pending') throw fail('Payment requires a refund.');
      const row = await owned(payment.request, payment.student, session); payable(row);
      if (row.totalCost !== payment.amount || row.currency !== payment.currency) throw fail('The approved amount changed during checkout.');
      if (String(row.gatewayAttempt) !== String(payment._id)) throw fail('Checkout no longer matches this request.');
      await lockStudent(payment.student, session);
      const plan = await prepareActivation(row, session);
      await Payment.updateOne({ _id: payment._id }, { $set: { stripePaymentIntent: checkout.payment_intent } }, { session });
      return finish(row, payment, plan, null, session);
    });
  } catch (error) {
    // Transient infrastructure failures must be retried, not refunded while a
    // successful transaction might still be resolving. Only business failures
    // (eligibility/slots/ownership) enter this compensation path.
    if (![403, 404, 409, 422].includes(error.status)) throw error;
    const marked = await Payment.findOneAndUpdate({ _id: payment._id, status: { $in: ['Pending', 'RefundRequired'] } }, { $set: { status: 'RefundRequired', stripePaymentIntent: checkout.payment_intent } }, { new: true });
    if (!marked) return { message: 'Payment already finalized. Refresh to see its status.' };
    const refund = await stripe.refunds.create({ payment_intent: checkout.payment_intent }, { idempotencyKey: `extra-hours-refund-${payment._id}` });
    if (refund.status !== 'succeeded') throw fail('Stripe refund is pending. Payment reconciliation will retry.', 503);
    await atomic(async (session) => {
      await Payment.updateOne({ _id: payment._id, status: 'RefundRequired' }, { $set: { status: 'Refunded', refundReference: refund.id } }, { session });
      await Request.updateOne({ _id: payment.request, gatewayAttempt: payment._id, settlementStatus: 'Awaiting Payment Choice' }, { $set: { settlementStatus: 'Failed' }, $inc: { __v: 1 }, $push: { history: { action: 'PaymentRefunded', note: payment.reference } } }, { session });
    });
    return { message: 'Your payment was refunded because eligibility or slot availability changed. No extra hours were activated.' };
  }
}
module.exports = { payWallet, startCheckout, confirmCheckout, cancelCheckout, confirmIntentFailure, stripeClient, atomic, owned, payable, lockStudent };
