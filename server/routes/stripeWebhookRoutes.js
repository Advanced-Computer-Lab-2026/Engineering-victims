const mongoose = require('mongoose');
const { stripeClient, confirmCheckout, confirmIntentFailure } = require('../services/extraHoursPaymentService');
module.exports = async (req, res) => {
  let event;
  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).json({ message: 'Stripe webhook is not configured.' });
    event = stripeClient().webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch { return res.status(400).json({ message: 'Invalid Stripe signature.' }); }
  if (event.livemode) return res.status(400).json({ message: 'Only test events are accepted.' });
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired', 'checkout.session.async_payment_failed', 'payment_intent.payment_failed'].includes(event.type)) return res.json({ received: true });
  const id = event.data?.object?.metadata?.paymentId;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Missing payment reference.' });
  try {
    if (event.type === 'payment_intent.payment_failed') await confirmIntentFailure(id, event.data.object.id, Number(event.data.object.metadata.generation || 0));
    else await confirmCheckout(id, null, event.data.object.id);
    res.json({ received: true });
  }
  catch { res.status(503).json({ message: 'Payment reconciliation pending. Retry delivery.' }); }
};
