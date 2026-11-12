import { CLOUD } from './config.js?v=1.1.2';
import { esc } from './util.js?v=1.1.2';

async function rpc(name, data) {
  const response = await fetch(CLOUD.url + '/rest/v1/rpc/' + name, {
    method: 'POST', headers: { apikey: CLOUD.key, Authorization: 'Bearer ' + CLOUD.key, 'Content-Type': 'application/json' },
    body: JSON.stringify(data), signal: AbortSignal.timeout(10000), cache: 'no-store', keepalive: true,
  });
  if (!response.ok) throw new Error('analytics_unavailable');
  return response.status === 204 ? null : response.json();
}
export function initAnalytics(store) {
  let visitor, source = 'direct', last = null;
  try {
    if (localStorage.getItem('nz.analytics.disabled') === '1' || navigator.doNotTrack === '1' || !CLOUD.url) return;
    visitor = localStorage.getItem('nz.visitor');
    if (!/^[0-9a-f-]{36}$/i.test(visitor || '')) { visitor = crypto.randomUUID(); localStorage.setItem('nz.visitor', visitor); }
    const from = new URLSearchParams(location.search).get('utm_source') || (document.referrer ? new URL(document.referrer).hostname : 'direct');
    if (/^[a-zA-Z0-9._-]{1,80}$/.test(from)) source = from;
  } catch { return; }
  const record = () => {
    const token = store.session?.token || '';
    if (last === token) return;
    last = token;
    rpc('nz_record_visit', { p_visitor: visitor, p_source: source, p_token: token }).catch(() => {
      last = null;
      if (token) rpc('nz_record_visit', { p_visitor: visitor, p_source: source, p_token: '' }).catch(() => {});
    });
  };
  record(); store.on(record);
  initBehavior(store, visitor);
}
export async function openFunnel(store) {
  const previous = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'analytics-overlay';
  overlay.innerHTML = '<section class="analytics-panel" role="dialog" aria-modal="true" aria-labelledby="analytics-title"><header class="analytics-header"><h2 id="analytics-title">Статистика сайта</h2><button type="button" class="btn" data-close aria-label="Закрыть статистику">Закрыть</button></header><div class="analytics-body" data-report tabindex="0" aria-live="polite">Загружаем…</div></section>';
  const oldOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  const close = () => { overlay.remove(); document.body.style.overflow = oldOverflow; previous?.focus(); };
  overlay.querySelector('[data-close]').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.addEventListener('keydown', e => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      const nodes = [...overlay.querySelectorAll('button,[tabindex="0"]')];
      if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0].focus(); }
    }
  });
  document.getElementById('sheet-root').append(overlay);
  overlay.querySelector('[data-close]').focus();
  const host = overlay.querySelector('[data-report]');
  try {
    await store.billing('status');
    const data = await rpc('nz_funnel_report', { p_token: store.session.token, p_days: 30 });
    const f = data.funnel;
    const steps = [
      ['Посетили', f.visitors],
      ['Начали пробную', f.trial_started],
      ['Сохранили все 4 результата', f.trial_completed],
      ['Открыли общие итоги', f.summary_seen],
      ['Увидели тарифы', f.offer_seen],
      ['Выбрали тариф', f.plan_selected],
      ['Нажали оплатить', f.checkout_submitted],
      ['Оплатили', f.buyers],
      ['Создали профиль после оплаты', f.profile_created_after_payment],
    ];
    const date = value => new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day:'numeric',month:'short',hour:'2-digit',minute:'2-digit' });
    const rows = steps.map(([title, count], index) => {
      const share = index && f.visitors ? ' · ' + Math.round(count / f.visitors * 100) + '% посетителей' : '';
      return '<dt>' + title + '</dt><dd><b>' + count + '</b>' + share + '</dd>';
    }).join('');
    host.innerHTML = '<b>Новые посетители после переноса регистрации</b>'
      + '<p>С ' + date(data.cohort_start) + ' по ' + date(data.measured_at) + ' (МСК).</p>'
      + '<small>Каждый человек учитывается один раз на шаге. Доли рассчитаны от посетителей этой группы. Это текущий срез, участники ещё могут продолжить.</small>'
      + '<dl>' + rows + '</dl>'
      + '<small>Четвёртый результат сохраняется до открытия общих итогов. Просмотр тарифа фиксируется, когда хотя бы половина карточки тарифа или блока предложения видна одну секунду. Пропуски событий возможны из-за сети, блокировщиков и закрытия вкладки. Покупка подтверждается сервером независимо от событий браузера.</small>'
      + '<hr><b>Вся история участников</b><p>Профилей с именем и PIN: ' + data.totals.registrations
      + ' · гостевых профилей: ' + data.totals.guests + '</p><p>Начали пробную: ' + data.totals.trial_started
      + ' · сохранили 4 результата: ' + data.totals.trial_completed + ' · покупателей: ' + data.totals.buyers + '</p>'
      + '<small>Именные профили включают регистрации до переноса. Гостевой профиль создаётся автоматически. Владелец и тестовые аккаунты исключены. До входа учитываются браузеры, после входа устройства объединяются по профилю.</small>'
      + '<hr><b>Пробные тренировки</b><ul>'
      + data.trials.map(t => '<li>' + esc(t.name) + ' — ' + (t.completed_at ? '4 результата сохранены' : 'в процессе, ' + t.exercises + ' из 4')
        + '<br><small>Начало: ' + date(t.started_at) + '</small></li>').join('') + '</ul>';
    try {
      const behavior = await rpc('nz_behavior_report', { p_token: store.session.token, p_days: 30 });
      if (host.isConnected) renderBehavior(host, behavior);
    } catch { host.insertAdjacentHTML('beforeend','<hr><p>Не удалось загрузить события поведения. Откройте статистику повторно.</p>'); }
  } catch { host.textContent = 'Не удалось загрузить статистику. Доступ есть только у владельца. Попробуйте войти повторно.'; }
}

let emit = () => {};
let flushPending = async () => {};
export function trackAction(target) { emit("commerce", target); }
export async function flushAnalytics() { await Promise.race([flushPending().catch(() => {}), new Promise(resolve => setTimeout(resolve, 800))]); }
let currentScreen = 'loading';
export function trackScreen(name) {
  emit('screen', name);
  currentScreen = name;
}
export function trackExercise(stage, id, ms = 0) { emit('exercise', stage + '_' + id, ms); }
const safeId = x => typeof x === 'string' && /^[a-z0-9_-]{1,48}$/i.test(x) ? x : '';
function controlId(node) {
  for (const key of ['act','plan','ex','chart','r']) if (safeId(node.dataset[key])) return key + '_' + node.dataset[key];
  for (const key of ['checkout','close','back','retry']) if (node.hasAttribute('data-' + key)) return 'billing_' + key;
  if (node.matches('.subscription-offer')) return 'offer';
  if (node.type === 'submit') return 'form_submit';
  return '';
}
function initBehavior(store, visitor) {
  let session;
  try {
    const saved = JSON.parse(sessionStorage.getItem('nz.behavior.session') || 'null');
    session = saved && Date.now() - saved.at < 1800000 ? saved.id : crypto.randomUUID();
    sessionStorage.setItem('nz.behavior.session', JSON.stringify({id: session, at: Date.now()}));
  } catch { session = crypto.randomUUID(); }
  let queue = [], sending = null, lastActivity = performance.now(), tick = performance.now(), activeMs = 0;
  let maxScroll = 0;
  const allowed = () => {
    try { return localStorage.getItem('nz.analytics.disabled') !== '1' && navigator.doNotTrack !== '1' && store.session?.key !== 'рома' && !/^__(qa|test)_/.test(store.session?.key || ''); } catch { return false; }
  };
  emit = (event, target = '', ms = 0, value = 0, point = {}) => {
    if (!allowed()) { queue = []; return; }
    if (queue.length >= 100) queue.shift();
    queue.push({id: crypto.randomUUID(), at: new Date().toISOString(), event, target: safeId(target), screen: safeId(currentScreen), x: point.x ?? null, y: point.y ?? null, ms: Math.min(600000,Math.max(0,Math.round(ms))), value: Math.min(100000,Math.max(0,Math.round(value)))});
  };
  async function flush() {
    if (!allowed()) { queue = []; return; }
    if (sending) { try { await sending; } catch { return; } if (queue.length) return flush(); return; }
    if (!queue.length) return;
    const batch = queue.splice(0,30);
    try { sending = rpc('nz_behavior_events', {p_visitor: visitor, p_session: session, p_token: store.session?.token || '', p_events: batch}); await sending; }
    catch { queue = batch.concat(queue).slice(-100); }
    finally { sending = null; }
  }
  flushPending = flush;
  function accountTime() {
    const now = performance.now();
    if (document.visibilityState === 'visible') activeMs += Math.max(0, Math.min(now,lastActivity + 60000) - tick);
    tick = now;
  }
  function activity() { accountTime(); lastActivity = performance.now(); }
  ['pointerdown','keydown','scroll','touchstart'].forEach(type => document.addEventListener(type, activity, {passive:true,capture:true}));
  document.addEventListener('click', e => {
    if (!(e.target instanceof Element) || e.target.closest('.analytics-overlay,.keypad')) return;
    const node = e.target.closest('button,a,input,label,[data-act],[data-plan],[data-ex],[data-chart],[data-r]') || e.target;
    let id = controlId(node);
    if (!id && node.matches('input')) id = 'field_' + (['email','checkbox','password'].includes(node.type) ? node.type : 'text');
    if (!id && node.matches('a')) {
      const href = node.getAttribute('href') || '';
      id = /^(privacy|offer)\.html$/.test(href) ? 'link_' + href.split('.')[0] : 'link_other';
    }
    if (!id) {
      let el = node, path = [];
      for (let i=0; el && i<5; i++,el=el.parentElement) path.push([...el.parentElement?.children || []].indexOf(el));
      id = 'tap_' + node.tagName.toLowerCase().slice(0,10) + '_' + path.join('_');
    }
    emit('click',id,0,0,{x:Math.round(Math.max(0,Math.min(1,e.clientX/innerWidth))*1000), y:Math.round(Math.max(0,Math.min(1,e.clientY/innerHeight))*1000)});
  },true);
  document.addEventListener('invalid', e => { const form = e.target.closest('[data-checkout]'); if (form) emit('commerce', e.target.type === 'checkbox' ? 'consent_missing' : 'email_invalid'); },true);
  document.addEventListener('submit', () => emit('submit','form'),true);
  document.addEventListener('scroll', () => {
    const height = document.documentElement.scrollHeight - innerHeight;
    const depth = height > 0 ? Math.min(100,Math.round(scrollY/height*100)) : 100;
    const step = Math.floor(depth/25)*25;
    if (step > maxScroll) { maxScroll = step; emit('scroll','page',0,step); }
  },{passive:true});
  // An impression requires an actual visible control for at least one second.
  const watched = new WeakSet(), viewed = new WeakSet(), timers = new WeakMap();
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    const node = entry.target;
    clearTimeout(timers.get(node));
    if (entry.isIntersecting && entry.intersectionRatio >= .5 && !viewed.has(node)) timers.set(node,setTimeout(() => {
      if (node.isConnected && document.visibilityState === 'visible') { const id = controlId(node); if (id) emit('impression',id); viewed.add(node); }
    },1000));
  }),{threshold:[0,.5]});
  const scan = () => document.querySelectorAll('[data-act],[data-plan],[data-ex],[data-chart],[data-r],[data-checkout],[data-close],[data-back],[data-retry],.subscription-offer,button[type="submit"]').forEach(node => {
    if (!watched.has(node) && !node.closest('.analytics-overlay')) { watched.add(node); observer.observe(node); }
  });
  new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
  scan();
  const billing = store.billing.bind(store);
  store.billing = async (action, ...args) => {
    const start = performance.now();
    emit('request_start',safeId(action));
    try { const result = await billing(action,...args); emit('request_ok',safeId(action),performance.now()-start); return result; }
    catch (error) { emit('request_error',safeId(action),performance.now()-start); throw error; }
  };
  window.addEventListener('error', () => emit('error','script'));
  window.addEventListener('unhandledrejection', () => emit('error','promise'));
  window.addEventListener('online', () => { emit('connection','online'); flush(); });
  window.addEventListener('offline', () => emit('connection','offline'));
  function heartbeat() { accountTime(); if (activeMs > 0) { emit('active','visible',activeMs); activeMs = 0; } }
  document.addEventListener('visibilitychange', () => { heartbeat(); emit('visibility',document.visibilityState); flush(); });
  window.addEventListener('pagehide', () => { heartbeat(); emit('leave',currentScreen); flush(); });
  setInterval(() => { heartbeat(); flush(); },15000);
  const oldEmit = emit;
  emit = (...args) => { if (args[0] === 'screen') { heartbeat(); maxScroll = 0; } if (args[0] === 'screen') currentScreen = args[1]; oldEmit(...args); };
  emit('session','start',0,innerWidth < 768 ? 1 : 2);
  emit('screen',currentScreen);
  const nav = performance.getEntriesByType('navigation')[0];
  if (nav) emit('load','document',nav.duration || performance.now());
  setTimeout(flush,1500);
}
const eventNames = {screen:'Экран',click:'Нажатие',impression:'Увидел кнопку',submit:'Отправил форму',scroll:'Глубина прокрутки',active:'Активное время',request_start:'Запрос начат',request_ok:'Запрос завершён',request_error:'Ошибка запроса',error:'Ошибка приложения',connection:'Связь',visibility:'Видимость',leave:'Ушёл с экрана',session:'Начало визита',load:'Загрузка',exercise:'Упражнение',commerce:'Оплата и предложение'};
const targetNames = {
 home:'Главная',login:'Вход',intro:'Инструкция',play:'Упражнение',result:'Результат',summary:'Итоги тренировки',loading:'Загрузка',
 offer:'Предложение подписки',act_session:'Начать или продолжить тренировку',act_subscribe:'Открыть подписку',act_settings:'Настройки',plan_individual:'Тариф для себя',plan_family:'Семейный тариф',form_submit:'Отправить форму',billing_checkout:'Форма оплаты',billing_close:'Закрыть предложение',billing_back:'Вернуться к тарифам',r_home:'Позже или на главную',r_next:'Следующее упражнение',r_again:'Повторить',
 subscription_open:'Открыта подписка',checkout_form_individual:'Форма оплаты: для себя',checkout_form_family:'Форма оплаты: для семьи',checkout_submit_individual:'Нажата оплата: для себя',checkout_submit_family:'Нажата оплата: для семьи',checkout_redirect:'Переход на платёжную страницу',checkout_error:'Ошибка создания оплаты',checkout_processing:'Оплата обрабатывается',payment_return:'Возврат с платёжной страницы',access_confirmed:'Доступ подтверждён',payment_pending:'Подтверждение ещё не получено',payments_unavailable:'Оплата недоступна',consent_missing:'Не отмечено согласие',email_invalid:'Почта не прошла проверку',
 status:'Проверка доступа',checkout:'Создание оплаты','trial-start':'Начало пробной','trial-result':'Сохранение этапа пробной',pull:'Загрузка результатов',push:'Сохранение результатов',visible:'Видимая вкладка',hidden:'Вкладка скрыта',document:'Страница',page:'Страница',start:'Начало',script:'Ошибка приложения',promise:'Ошибка операции'
};
function targetLabel(id) {
 if (targetNames[id]) return targetNames[id];
 if (id.startsWith('tap_')) return 'Касание области ('+id.slice(4)+')';
 if (id.startsWith('field_')) return 'Поле: '+({email:'почта',checkbox:'согласие',password:'PIN',text:'ввод'}[id.slice(6)] || 'ввод');
 const ex = {sch_f:'Шульте',sch_r:'Шульте вверх ногами',dob:'Совпадения',mem:'Запоминание слов'};
 for (const [key,title] of Object.entries(ex)) {
  for (const [prefix,stage] of Object.entries({intro:'Инструкция',start:'Начато',complete:'Завершено',quit:'Прервано',ex:'Выбор упражнения',chart:'График'})) if (id === prefix+'_'+key) return stage+': '+title;
 }
 return id;
}
function renderBehavior(host, data) {
  const sec = document.createElement('section');
  sec.innerHTML = '<hr><h3>Поведение за 30 дней</h3><p>Сессий: '+data.sessions+' · активное время: '+Math.round(data.active_ms/60000)+' мин · ошибок запросов: '+data.errors+'</p><small>Активное время учитывает видимую вкладку и паузы до 60 секунд. Показы кнопок — видимость не менее секунды. Отсутствие нажатия само по себе не доказывает отсутствие интереса. Сбор начат после обновления; блокировщики и закрытие браузера могут приводить к пропускам.</small><details open><summary>Путь к оплате</summary><ul>'+data.commerce.map(x=>'<li>'+esc(targetLabel(x.target))+' — '+x.visitors+' посетителей, '+x.count+' событий</li>').join('')+'</ul></details><details><summary>Кнопки: показы и нажатия</summary><table><thead><tr><th>Элемент</th><th>Показы</th><th>Нажатия</th></tr></thead><tbody>'+data.controls.map(x=>'<tr><td>'+esc(targetLabel(x.target))+'</td><td>'+x.views+'</td><td>'+x.clicks+'</td></tr>').join('')+'</tbody></table></details><details><summary>Ожидание и ошибки</summary><ul>'+data.requests.map(x=>'<li>'+esc(targetLabel(x.target))+': '+x.count+' запросов · медиана '+(x.median_ms/1000).toFixed(1)+' с · 95% до '+(x.p95_ms/1000).toFixed(1)+' с · ошибок '+x.errors+'</li>').join('')+'</ul></details><details><summary>Последние сессии и последовательность действий</summary><small>Время по Москве. Анонимные посетители обозначены без имени. Показаны до 40 сессий и 100 последних событий в каждой.</small>'+data.journeys.map(x=>'<details><summary>'+esc(x.name || 'Посетитель')+' · '+new Date(x.started).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' · '+(x.mobile?'телефон':'компьютер')+'</summary><ol>'+x.events.map(e=>'<li>'+new Date(e.created_at).toLocaleTimeString('ru-RU',{timeZone:'Europe/Moscow'})+' · '+esc(eventNames[e.event] || e.event)+' · '+esc(targetLabel(e.target || e.screen))+(e.ms?' · '+(e.ms/1000).toFixed(1)+' с':'')+(e.event==='scroll'?' · '+e.value+'%':'')+(e.event==='click' && e.x !== null?' · точка '+Math.round(e.x/10)+'% × '+Math.round(e.y/10)+'% экрана':'')+'</li>').join('')+'</ol></details>').join('')+'</details>';
  host.append(sec);
}

