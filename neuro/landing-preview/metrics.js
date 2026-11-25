import { CLOUD } from '../js/config.js?v=1.5.0';

const params = new URLSearchParams(location.search);
const ctas = [...document.querySelectorAll('[data-training-entry]')];
function start() {
  let visitor, session, token, source;
  try {
    const account = JSON.parse(localStorage.getItem('nz.session') || 'null');
    if (params.get('edit') === '1' || localStorage.getItem('nz.analytics.disabled') === '1' ||
        navigator.doNotTrack === '1' || globalThis.doNotTrack === '1' ||
        /^(рома$|__(qa|test)_)/i.test(account?.key || '')) return;
    visitor = localStorage.getItem('nz.visitor');
    if (!/^[0-9a-f-]{36}$/i.test(visitor || '')) {
      visitor = crypto.randomUUID();
      localStorage.setItem('nz.visitor', visitor);
    }
    session = crypto.randomUUID();
    sessionStorage.setItem('nz.behavior.session', JSON.stringify({id:session, at:Date.now()}));
    source = params.get('utm_source') || (document.referrer ? new URL(document.referrer).hostname : 'direct');
    if (!/^[a-z0-9._-]{1,80}$/i.test(source)) source = 'direct';
    token = account?.token || '';
  } catch { return; }

  const allowed = () => {
    try { return localStorage.getItem('nz.analytics.disabled') !== '1'; }
    catch { return false; }
  };
  for (const link of ctas) {
    const url = new URL(link.href);
    url.searchParams.set('land_from', link.dataset.trainingEntry);
    link.href = url.href;
  }

  const ids = new Set();
  let queue = [], identifying;
  const send = (name, body) => fetch(CLOUD.url + '/rest/v1/rpc/' + name, {
    method:'POST', keepalive:true, cache:'no-store',
    headers:{apikey:CLOUD.key, Authorization:'Bearer ' + CLOUD.key, 'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  function emit(event, target, ms = 0, value = 0) {
    if (!allowed()) return;
    if (queue.length >= 150) queue.shift();
    queue.push({id:crypto.randomUUID(), at:new Date().toISOString(), screen:'landing', event,target,ms:Math.round(ms),value});
  }
  function once(event, target, value = 0) {
    const key = event + ':' + target;
    if (ids.has(key)) return;
    ids.add(key);
    emit(event, target, 0, value);
  }
  async function identify() {
    const record = () => send('nz_record_visit',{p_visitor:visitor,p_source:source,p_token:token});
    let res = await record();
    if (!res.ok && token && [400,401,403].includes(res.status)) {
      token = '';
      res = await record();
    }
    if (!res.ok) throw Error('visit_unavailable');
  }
  async function flush({urgent = false} = {}) {
    if (!allowed() || !queue.length) return;
    if (!identifying) identifying = identify().catch(() => { identifying = null; });
    if (!urgent) await identifying;
    if (!queue.length || !allowed()) return;
    const batch = queue.splice(0,30);
    try {
      const res = await send('nz_behavior_events',{p_visitor:visitor,p_session:session,p_token:token,p_events:batch});
      if (!res.ok) throw Error('events_unavailable');
    } catch { queue = batch.concat(queue).slice(-150); }
  }
  if (/^\/neuro(?:\/index\.html|\/)?$/.test(location.pathname)) {
    const url = new URL(location.href);
    const second = url.searchParams.get('entry') === 'm';
    if (second) {
      url.searchParams.delete('entry');
      history.replaceState(history.state, '', url);
    }
    const external = document.referrer && new URL(document.referrer).origin !== location.origin;
    const previous = localStorage.getItem('nz.lastPartner');
    // A bookmark or reload keeps the last known referral.
    if (second || external || !previous) {
      const partner = second ? 'm' : 'evgenia';
      localStorage.setItem('nz.lastPartner', partner);
      emit('session', 'partner_' + partner);
    }
  }
  const variant = document.querySelector('.hero-copy')?.dataset.heroVariant;
  if (['a','b','c'].includes(variant)) {
    const exposure = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', exposure);
      once('impression', 'land_hero5_' + variant);
      void flush();
    };
    if (document.visibilityState === 'visible') once('impression', 'land_hero5_' + variant);
    else document.addEventListener('visibilitychange', exposure);
  }
  emit('screen','landing_open');
  emit('session','landing_start',0, innerWidth < 768 ? 1 : 2);
  void flush();

  const tracked = '[data-training-entry], [data-landing-control], [data-age], [data-number]';
  const controlId = node => node.dataset.trainingEntry ? 'land_cta_' + node.dataset.trainingEntry :
    node.dataset.age ? 'land_age_' + node.dataset.age : node.hasAttribute('data-number') ? 'land_warmup_tile' : node.dataset.landingControl;
  document.addEventListener('click', event => {
    const control = event.target instanceof Element && event.target.closest(tracked);
    if (!control) return;
    emit('click', controlId(control));
    if (control.dataset.trainingEntry) {
      try { sessionStorage.setItem('nz.behavior.session', JSON.stringify({id:session,at:Date.now()})); } catch {}
      void flush({urgent:true});
    }
  }, true);
  document.addEventListener('nz-landing-exercise', event => {
    const target = event.detail?.target;
    if (/^land_(warmup|usual|focus)_(start|complete|auto|manual)$/.test(target || '')) {
      emit('exercise',target,0,Number(event.detail.speed)||0);
      void flush();
    }
  });

  if ('IntersectionObserver' in window) {
    const seen = new WeakMap();
    const onView = entries => entries.forEach(entry => {
      const node = entry.target;
      clearTimeout(seen.get(node));
      if (entry.isIntersecting && entry.intersectionRatio >= (node.dataset.landingSection ? .12 : .5) && document.visibilityState === 'visible') {
        seen.set(node,setTimeout(() => {
          if (document.visibilityState === 'visible') once('impression',node.dataset.landingSection || controlId(node));
        },1000));
      }
    });
    const sections = new IntersectionObserver(onView,{threshold:.12});
    document.querySelectorAll('[data-landing-section]:not([hidden])').forEach(node => sections.observe(node));
    const buttons = new IntersectionObserver(onView,{threshold:.5});
    ctas.forEach(node => buttons.observe(node));
  }
  function scroll() {
    const distance = document.documentElement.scrollHeight - innerHeight;
    const ratio = distance > 0 ? (scrollY + 8) / distance : 1;
    for (const step of [25,50,75,90,100]) if (ratio*100 >= step) once('scroll','land_scroll_' + step,step);
    const end = document.querySelector('footer');
    if (end && end.getBoundingClientRect().top < innerHeight) once('scroll','land_end',100);
  }
  document.addEventListener('scroll',scroll,{passive:true});
  scroll();

  let lastActivity = performance.now(), tick = lastActivity, activeMs = 0;
  let visible = document.visibilityState === 'visible';
  function accountTime() {
    const now = performance.now();
    if (visible) activeMs += Math.max(0,Math.min(now,lastActivity+60000)-tick);
    tick = now;
  }
  function activity() { accountTime(); lastActivity = performance.now(); }
  for (const name of ['pointerdown','keydown','scroll','touchstart']) document.addEventListener(name,activity,{passive:true,capture:true});
  function heartbeat() {
    accountTime();
    if (activeMs > 0) { emit('active','land_visible',activeMs); activeMs = 0; }
  }
  document.addEventListener('visibilitychange', () => {
    heartbeat();
    visible = document.visibilityState === 'visible';
    if (visible) activity();
    void flush({urgent:!visible});
  });
  window.addEventListener('pagehide', () => { heartbeat(); emit('leave','land_leave'); void flush({urgent:true}); });
  setInterval(() => { heartbeat(); void flush(); },10000);
}

start();
