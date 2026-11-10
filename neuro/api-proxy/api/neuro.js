const ORIGIN = 'https://plotnikovprod.ru';
const UPSTREAM = 'https://qucwykwlhipjnbeljuvq.supabase.co/functions/v1/neuro-billing';
const ACTIONS = new Set(['login','status','checkout','cancel','pull','push','logout','trial-start','trial-result','family-info','family-invite','family-join','family-remove','family-leave','family-revoke-invites']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.headers.origin && req.headers.origin !== ORIGIN) return res.status(403).json({error:'origin_denied'});
  if (req.method === 'OPTIONS') return res.status(204).end();
  const action = String(req.query.action || '');
  if (req.method === 'GET' && !action) {
    try {
      const response = await fetch(UPSTREAM, {signal:AbortSignal.timeout(20000)});
      return res.status(response.status).json(await response.json());
    } catch { return res.status(503).json({error:'temporarily_unavailable'}); }
  }
  if (req.method !== 'POST' || !ACTIONS.has(action)) return res.status(404).json({error:'not_found'});
  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    if (Buffer.byteLength(body)>262144) return res.status(413).json({error:'request_too_large'});
    const authorization = req.headers.authorization;
    const response = await fetch(UPSTREAM + '/' + action, {
      method:'POST', headers:{'Content-Type':'application/json', Origin:ORIGIN,...(authorization ? {Authorization:authorization} : {})},
      body, signal:AbortSignal.timeout(25000),
    });
    return res.status(response.status).json(await response.json());
  } catch { return res.status(503).json({error:'temporarily_unavailable'}); }
}
