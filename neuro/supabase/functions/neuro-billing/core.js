const ORIGIN = 'https://plotnikovprod.ru';
const RETURN_URL = ORIGIN + '/neuro/?payment=return';
export const CONSENT_VERSION = 'monthly-plans-v2';

export function createHandler({ env, fetch: request = globalThis.fetch, crypto = globalThis.crypto }) {
  const url = env('SUPABASE_URL');
  const service = env('SUPABASE_SERVICE_ROLE_KEY');
  const shop = env('YOOKASSA_SHOP_ID');
  const secret = env('YOOKASSA_SECRET_KEY');
  // Test keys can be exercised without enabling live charging. Verify the provider's
  // test flag before creating anything; NZ_PAYMENTS_ENABLED=false is the kill switch.
  const testMode = !!secret?.startsWith('test_');
  const ready = !!(shop && secret && (env('NZ_PAYMENTS_ENABLED') === 'true' || (testMode && env('NZ_PAYMENTS_ENABLED') !== 'false')));
  let verifiedTest = false;
  const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, '0')).join('');
  const rpc = async (action, data = {}) => {
    const res = await request(url + '/rest/v1/rpc/nz_billing_api', {
      method: 'POST', headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_action: action, p_data: data }), signal: AbortSignal.timeout(15000),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || 'database_unavailable');
    return body;
  };
  const yk = async (path, data, idempotencyKey) => {
    if (!ready) throw new Error('payments_unavailable');
    if (testMode && data && !verifiedTest) {
      const check = await request('https://api.yookassa.ru/v3/me', {
        headers: { Authorization: 'Basic ' + btoa(shop + ':' + secret) }, signal: AbortSignal.timeout(15000),
      });
      if (!check.ok || (await check.json()).test !== true) throw new Error('test_store_required');
      verifiedTest = true;
    }
    const res = await request('https://api.yookassa.ru/v3/' + path, {
      method: data ? 'POST' : 'GET', headers: { Authorization: 'Basic ' + btoa(shop + ':' + secret),
        'Content-Type': 'application/json', ...(data ? { 'Idempotence-Key': idempotencyKey } : {}) },
      ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error('provider_unavailable');
    const result = await res.json();
    if (testMode && result.test !== true) throw new Error('test_store_required');
    return result;
  };
  const settle = async order => {
    if (!order.provider_id) return;
    const payment = await yk('payments/' + encodeURIComponent(order.provider_id));
    await rpc('settle', { order_id: order.id, payment });
  };
  const submit = async order => {
    if (order.provider_id) { await settle(order); return order; }
    const claimed = await rpc('claim', { order_id: order.id });
    if (claimed.skip) return { processing: true };
    const body = {
      amount: { value: Number(claimed.amount).toFixed(2), currency: 'RUB' }, capture: true,
      description: claimed.plan === 'family' ? 'Нейро-зарядка: семья до 4 человек, 1 месяц' : 'Нейро-зарядка: 1 человек, 1 месяц', metadata: { order_id: claimed.id },
      ...(claimed.kind === 'checkout'
        ? { save_payment_method: true, payment_method_data: { type: 'bank_card' }, confirmation: { type: 'redirect', return_url: RETURN_URL } }
        : { payment_method_id: claimed.payment_method_id }),
    };
    // On a timeout, keep the order and reuse its UUID. Never generate another charge blindly.
    const payment = await yk('payments', body, claimed.id);
    const confirmation = payment.confirmation?.confirmation_url;
    if (confirmation && !/^https:\/\/(?:[^/]+\.)?(?:yookassa\.ru|yoomoney\.ru)\//.test(confirmation)) throw new Error('invalid_confirmation');
    await rpc('attach', { order_id: claimed.id, provider_id: payment.id, confirmation_url: confirmation || null });
    await rpc('settle', { order_id: claimed.id, payment });
    return { ...claimed, provider_id: payment.id, confirmation_url: confirmation };
  };
  return async req => {
    const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Vary': 'Origin',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });
    if (req.headers.get('origin') && req.headers.get('origin') !== ORIGIN) return reply({ error: 'origin_denied' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method === 'GET') return reply({ ready, configured: !!(shop && secret), test_mode: testMode, price: 299, currency: 'RUB', consent_version: CONSENT_VERSION });
    if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
    try {
      const text = await req.text();
      if (text.length > 262144) return reply({ error: 'request_too_large' }, 413);
      const body = JSON.parse(text);
      const action = new URL(req.url).pathname.split('/').filter(Boolean).pop();
      if (action === 'diagnostics') {
        const auth = await rpc('job_auth', { token: req.headers.get('x-nz-job-token') || '' });
        if (!auth.ok) return reply({ error: 'unauthorized' }, 401);
        if (!shop || !secret) return reply({ configured: false });
        const response = await request('https://api.yookassa.ru/v3/me', {
          headers: { Authorization: 'Basic ' + btoa(shop + ':' + secret) }, signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) return reply({ configured: true, verified: false, provider_status: response.status });
        const info = await response.json();
        return reply({ configured: true, verified: true, shop_id: info.account_id, test: info.test, ready });
      }
      if (action === 'webhook') {
        if (!ready) return reply({ error: 'payments_unavailable' }, 503);
        const id = body.object?.id;
        if (body.type !== 'notification' || !['payment.succeeded', 'payment.canceled'].includes(body.event) || !/^[\w-]{10,80}$/.test(id || '')) return reply({ ok: true });
        // The notification body is untrusted. Fetch the authoritative object with merchant credentials.
        const payment = await yk('payments/' + encodeURIComponent(id));
        const orderId = payment.metadata?.order_id;
        if (!/^[a-f0-9-]{36}$/i.test(orderId || '')) return reply({ ok: true });
        const order = await rpc('payment', { order_id: orderId });
        // Recover an authoritative payment even if the original creation response was lost.
        if (!order.provider_id) {
          if (payment.amount?.currency !== 'RUB' || Number(payment.amount?.value) !== Number(order.amount)) return reply({ error: 'payment_mismatch' }, 400);
          await rpc('attach', { order_id: orderId, provider_id: payment.id, confirmation_url: payment.confirmation?.confirmation_url || null });
        }
        await rpc('settle', { order_id: orderId, payment, source: 'webhook' });
        return reply({ ok: true });
      }
      if (action === 'renew') {
        const auth = await rpc('job_auth', { token: req.headers.get('x-nz-job-token') || '' });
        if (!auth.ok) return reply({ error: 'unauthorized' }, 401);
        if (!ready) return reply({ ready: false });
        const due = await rpc('due');
        let processed = 0, failed = 0;
        for (const reminder of due.reminders) {
          try {
            const key = env('RESEND_API_KEY'), from = env('NZ_MAIL_FROM');
            if (!key || !from) { failed++; continue; }
            const res = await request('https://api.resend.com/emails', {
              method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json',
                'Idempotency-Key': 'nz-' + await hash(reminder.user_key + ':' + reminder.paid_until) },
              body: JSON.stringify({ from, to: [reminder.email], subject: 'Нейро-зарядка: предстоящее продление',
                text: `Не ранее чем через 24 часа продлим вашу подписку на Нейро-зарядку за ${reminder.amount} ₽ на месяц. Отключить автопродление можно в настройках: https://plotnikovprod.ru/neuro/ . После отключения доступ останется до конца оплаченного срока.` }),
              signal: AbortSignal.timeout(15000),
            });
            if (!res.ok) throw new Error('mail_unavailable');
            await rpc('reminded', reminder);
          } catch { failed++; }
        }
        for (const order of due.payments) {
          try { await submit(order); processed++; } catch { failed++; }
        }
        for (const user_key of due.users) {
          try { const order = await rpc('renew', { user_key }); if (!order.skip) { await submit(order); processed++; } } catch { failed++; }
        }
        return reply({ processed, failed });
      }
      if (action === 'login') {
        const name = String(body.name || '').trim().replace(/\s+/g, ' ');
        const key = name.toLowerCase().replace(/ё/g, 'е');
        if (!key || key.length > 40 || !/^[a-f0-9]{64}$/.test(body.hash || '')) return reply({ status: 'invalid' }, 400);
        const token = [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('');
        const result = await rpc('login', { key, name, hash: body.hash, create: body.create === true, token_hash: await hash(token) });
        return reply({ ...result, ...(['ok', 'created'].includes(result.status) ? { token } : {}) });
      }
      if (!['status', 'checkout', 'cancel', 'pull', 'push', 'logout', 'trial-start', 'trial-result', 'family-info', 'family-invite', 'family-join', 'family-remove', 'family-leave', 'family-revoke-invites'].includes(action)) return reply({ error: 'not_found' }, 404);
      const token = req.headers.get('authorization')?.replace(/^Bearer /, '') || '';
      if (!/^[a-f0-9]{64}$/.test(token)) return reply({ error: 'unauthorized' }, 401);
      const token_hash = await hash(token);
      if (action === 'checkout') {
        if (!ready) return reply({ error: 'payments_unavailable' }, 503);
        if (body.consent !== true) return reply({ error: 'consent_required' }, 400);
        const order = await rpc('checkout', { token_hash, email: String(body.email || '').trim(), consent_version: body.consent_version, plan: body.plan || 'individual' });
        const result = await submit(order);
        return reply({ confirmation_url: result.confirmation_url || null, processing: !result.confirmation_url });
      }
      if (action === 'family-invite') {
        const invite = [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('');
        await rpc('family_invite', { token_hash, invite_hash: await hash(invite) });
        return reply({ link: ORIGIN + '/neuro/#family=' + invite });
      }
      const data = { token_hash, ...(action === 'push' ? { rows: body.rows } : {}),
        ...(action === 'trial-result' ? { trial_id: body.trial_id, row: body.row } : {}),
        ...(action === 'family-join' ? { invite_hash: await hash(String(body.invite || '')) } : {}),
        ...(action === 'family-remove' ? { member_key: String(body.member_key || '') } : {}),
      };
      return reply({ ...await rpc(action.replaceAll('-', '_'), data), ...(action === 'status' ? { ready } : {}) });
    } catch (e) {
      const message = String(e.message);
      const known = ['unauthorized', 'subscription_required', 'already_active', 'consent_required', 'invalid_email', 'payments_unavailable', 'invalid_plan', 'checkout_in_progress', 'trial_completed', 'invalid_trial', 'trial_order', 'invalid_invite', 'family_full', 'family_owner_required'];
      return reply({ error: known.includes(message) ? message : 'temporarily_unavailable' }, message === 'unauthorized' ? 401 : message === 'subscription_required' ? 403 : known.includes(message) ? 400 : 503);
    }
  };
}
