import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './core.js';

const settings = { SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_ROLE_KEY: 'service',
  YOOKASSA_SHOP_ID: '123', YOOKASSA_SECRET_KEY: 'test', NZ_PAYMENTS_ENABLED: 'true' };
const make = (fetch, overrides = {}) => createHandler({ env: key => ({ ...settings, ...overrides })[key], fetch });
const req = (action, body, token) => new Request('https://db.invalid/functions/v1/neuro-billing/' + action, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body),
});
const ok = data => new Response(JSON.stringify(data));

test('missing credentials keep payment creation disabled', async () => {
  const handler = make(() => { throw new Error('Must not call provider'); }, { YOOKASSA_SECRET_KEY: undefined });
  const response = await handler(req('checkout', { consent: true }, 'a'.repeat(64)));
  assert.equal(response.status, 503);
});
test('checkout requires explicit consent', async () => {
  const handler = make(() => { throw new Error('Must not call provider'); });
  const response = await handler(req('checkout', { consent: false }, 'a'.repeat(64)));
  assert.equal((await response.json()).error, 'consent_required');
});
test('browser cannot call renewal worker', async () => {
  const handler = make(async () => ok({ ok: false }));
  assert.equal((await handler(req('renew', {}))).status, 401);
});
test('webhook verifies with provider; never trusts forged success payload', async () => {
  const calls = [];
  const handler = make(async (url, options) => {
    calls.push({ url, body: options?.body && JSON.parse(options.body) });
    if (url.includes('api.yookassa.ru')) return ok({ id: 'payment-12345', status: 'pending', metadata: { order_id: '11111111-1111-4111-8111-111111111111' } });
    const data = JSON.parse(options.body);
    if (data.p_action === 'payment') return ok({ provider_id: 'payment-12345' });
    return ok({ ok: true });
  });
  assert.equal((await handler(req('webhook', { type: 'notification', event: 'payment.succeeded', object: { id: 'payment-12345', status: 'succeeded' } }))).status, 200);
  assert.equal(calls[0].url, 'https://api.yookassa.ru/v3/payments/payment-12345');
  assert.equal(calls.at(-1).body.p_data.payment.status, 'pending');
});
test('checkout fixes server-side amount and uses order UUID as idempotency key', async () => {
  const order = { id: '11111111-1111-4111-8111-111111111111', kind: 'checkout', amount: 299, plan: 'individual' };
  let providerCall;
  const handler = make(async (url, options) => {
    if (url.includes('api.yookassa.ru')) {
      providerCall = options;
      return ok({ id: 'payment-12345', status: 'pending', confirmation: { confirmation_url: 'https://yoomoney.ru/checkout/test' } });
    }
    const action = JSON.parse(options.body).p_action;
    return ok(['checkout', 'claim'].includes(action) ? order : { ok: true });
  });
  const response = await handler(req('checkout', { consent: true, consent_version: '299-monthly-v1', email: 'test@example.ru', amount: '0.01' }, 'a'.repeat(64)));
  assert.equal(response.status, 200);
  assert.equal(providerCall.headers['Idempotence-Key'], order.id);
  assert.deepEqual(JSON.parse(providerCall.body).amount, { value: '299.00', currency: 'RUB' });
  assert.equal(JSON.parse(providerCall.body).save_payment_method, true);
});
test('untrusted origin cannot initiate checkout', async () => {
  const handler = make(() => { throw new Error('Must not call provider'); });
  const request = req('checkout', {});
  request.headers.set('Origin', 'https://evil.invalid');
  assert.equal((await handler(request)).status, 403);
});
test('family checkout uses 599 from reserved order, not client-provided amount', async () => {
  let sent;
  const handler = make(async (url, options) => {
    if (url.includes('api.yookassa.ru')) { sent = JSON.parse(options.body); return ok({ id: 'family-payment', status: 'pending' }); }
    const action = JSON.parse(options.body).p_action;
    return ok(['checkout','claim'].includes(action) ? { id: '11111111-1111-4111-8111-111111111111', kind: 'checkout', plan: 'family', amount: 599 } : { ok: true });
  });
  await handler(req('checkout', { consent: true, plan: 'family', amount: '1.00' }, 'a'.repeat(64)));
  assert.deepEqual(sent.amount, { value: '599.00', currency: 'RUB' });
  assert.match(sent.description, /4 человек/);
});
test('test-key mode is available without enabling live payments', async () => {
  const handler = make(() => { throw new Error('No provider call needed'); }, { YOOKASSA_SECRET_KEY: 'test_example', NZ_PAYMENTS_ENABLED: undefined });
  const health = await (await handler(new Request('https://db.invalid/functions/v1/neuro-billing'))).json();
  assert.equal(health.ready, true);
  assert.equal(health.test_mode, true);
});
test('test creation refuses merchant that provider identifies as live', async () => {
  const order = { id: '11111111-1111-4111-8111-111111111111', kind: 'checkout', amount: 299, plan: 'individual' };
  let paymentPosts = 0;
  const handler = make(async (url, options) => {
    if (url.endsWith('/me')) return ok({ test: false });
    if (url.includes('api.yookassa.ru')) { paymentPosts++; throw new Error('Unsafe'); }
    return ok(order);
  }, { YOOKASSA_SECRET_KEY: 'test_example', NZ_PAYMENTS_ENABLED: undefined });
  const response = await handler(req('checkout', { consent: true }, 'a'.repeat(64)));
  assert.equal(response.status, 503);
  assert.equal(paymentPosts, 0);
});
test('diagnostics require worker authentication and never expose credentials', async () => {
  const handler = make(async () => ok({ ok: false }));
  const response = await handler(req('diagnostics', {}));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'unauthorized' });
});
