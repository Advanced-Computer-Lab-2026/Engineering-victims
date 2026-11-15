process.env.STRIPE_WEBHOOK_SECRET = 'whsec_unit_test';
jest.mock('../services/extraHoursPaymentService', () => ({ stripeClient: jest.fn(), confirmCheckout: jest.fn(), confirmIntentFailure: jest.fn() }));
const express = require('express'), http = require('supertest'), Stripe = require('stripe');
const { stripeClient, confirmCheckout, confirmIntentFailure } = require('../services/extraHoursPaymentService');
const stripe = Stripe('sk_test_signature_only');
const app = express(); app.post('/webhook', express.raw({ type: 'application/json' }), require('../routes/stripeWebhookRoutes'));
const id = '507f1f77bcf86cd799439012';
beforeEach(() => { jest.resetAllMocks(); stripeClient.mockReturnValue(stripe); confirmCheckout.mockResolvedValue({ message: 'Confirmed' }); });
const signed = (overrides = {}) => {
  const payload = JSON.stringify({ id: 'evt_test', livemode: false, type: 'checkout.session.completed', data: { object: { id: 'cs_test_signature', metadata: { paymentId: id } } }, ...overrides });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  return http(app).post('/webhook').set('Content-Type', 'application/json').set('stripe-signature', signature).send(payload);
};
test('real Stripe signature over original bytes is verified before reconciliation', async () => {
  expect((await signed()).status).toBe(200); expect(confirmCheckout).toHaveBeenCalledWith(id, null, 'cs_test_signature');
});
test('unsigned request cannot activate anything', async () => {
  expect((await http(app).post('/webhook').set('Content-Type', 'application/json').send('{}')).status).toBe(400); expect(confirmCheckout).not.toHaveBeenCalled();
});
test('live events rejected', async () => { expect((await signed({ livemode: true })).status).toBe(400); expect(confirmCheckout).not.toHaveBeenCalled(); });
test('irrelevant signed events acknowledged without fulfillment', async () => {
  expect((await signed({ type: 'customer.created' })).status).toBe(200); expect(confirmCheckout).not.toHaveBeenCalled();
});
test('failed reconciliation returns non-success so Stripe retries', async () => {
  confirmCheckout.mockRejectedValue(new Error('temporary database failure')); expect((await signed()).status).toBe(503);
});
test.each(['checkout.session.expired', 'checkout.session.async_payment_failed'])('%s is verified and reconciled', async (type) => {
  expect((await signed({ type })).status).toBe(200); expect(confirmCheckout).toHaveBeenCalledWith(id, null, 'cs_test_signature');
});
test('payment-intent failure uses its generation and provider reference', async () => {
  expect((await signed({ type: 'payment_intent.payment_failed', data: { object: { id: 'pi_failure', metadata: { paymentId: id, generation: '2' } } } })).status).toBe(200);
  expect(confirmIntentFailure).toHaveBeenCalledWith(id, 'pi_failure', 2); expect(confirmCheckout).not.toHaveBeenCalled();
});
