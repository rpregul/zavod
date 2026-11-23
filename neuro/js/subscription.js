import { trackAction, flushAnalytics } from './analytics.js?v=1.5.0';
import { BILLING, CLOUD } from './config.js?v=1.5.0';
import { sheet, confirmSheet } from './ui.js?v=1.5.0';
import { esc } from './util.js?v=1.5.0';

let couponStore, state, dialog, busy=false, visibleSince=0, lastList, retryAfter=0;
function left() {
  return state?.key === couponStore?.session?.key && state ? Math.max(0, Math.ceil((state.deadline-Date.now())/1000)) : 0;
}
export const saleActive = () => Boolean(state?.applied && left());
export function countdownText() {
  const seconds=left();
  return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
}
export function clockMarkup() {
  return '<div class="flip-clock" role="timer"><span class="flip-tile coupon-clock" data-coupon-clock>'+countdownText()+'</span></div>';
}
async function requestCoupon(action) {
  const session=couponStore.session;
  const response=await fetch(CLOUD.url+'/rest/v1/rpc/nz_first_offer_coupon',{
    method:'POST',cache:'no-store',signal:AbortSignal.timeout(10000),
    headers:{apikey:CLOUD.key,Authorization:'Bearer '+CLOUD.key,'Content-Type':'application/json'},
    body:JSON.stringify({p_token:session.token,p_action:action})
  });
  if(!response.ok) throw new Error('coupon_unavailable');
  const result=await response.json();
  if(couponStore.session?.token!==session.token) throw new Error('session_changed');
  state={key:session.key,applied:result.applied,deadline:Date.now()+Date.parse(result.expires_at)-Date.parse(result.server_now)};
}
function paintOffers() {
  const active=saleActive();
  for(const box of document.querySelectorAll('[data-coupon-box]')) {
    if(box.dataset.discounted===String(active)) continue;
    box.dataset.discounted=String(active);
    box.classList.toggle('bf-shell',active);
    box.querySelector('[data-coupon-head]').hidden=!active;
    box.querySelector('.subscription-plans').classList.toggle('black-friday',active);
    for(const button of box.querySelectorAll('[data-plan]')) {
      const plan=PLANS[button.dataset.plan];
      button.querySelector('.bf-old').hidden=!active;
      button.querySelector('[data-current-price]').textContent=money(plan.price);
      const family=button.querySelector('[data-family-price]');
      if(family) family.textContent=Math.ceil(plan.price/4);
      const quarter=button.querySelector('[data-quarter-savings]');
      if(quarter) quarter.textContent=savings(plan.price);
    }
  }
  for(const clock of document.querySelectorAll('[data-coupon-clock]')) {
    const value=countdownText();
    if(clock.textContent!==value) clock.textContent=value;
  }
}
function closeCoupon() {
  if(dialog){dialog.close();dialog.remove();dialog=null;}
}
function displayCoupon() {
  dialog=document.createElement('dialog');
  dialog.className='nz-coupon';
  dialog.setAttribute('aria-labelledby','nz-coupon-title');
  dialog.innerHTML='<p>Ваш персональный купон</p><h2 id="nz-coupon-title">Скидка 25%</h2><p>Действительна в течение десяти минут.</p>'+clockMarkup()+'<p role="status"></p><button autofocus class="btn btn--primary btn--lg btn--block">Применить купон</button>';
  document.body.append(dialog);
  dialog.addEventListener('cancel',event=>event.preventDefault());
  const button=dialog.querySelector('button');
  button.onclick=async()=>{
    button.disabled=true;
    try {
      await requestCoupon('apply');
      if(saleActive()) trackAction('coupon_applied');
      closeCoupon();paintOffers();
    } catch {if(dialog) dialog.querySelector('[role=status]').textContent='Проверьте соединение и нажмите ещё раз.';}
    finally {button.disabled=false;}
  };
  dialog.showModal();
  trackAction('coupon_shown');
  playChime();
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for(let i=0;i<36;i++){
      const star=document.createElement('i'),angle=i*2.4;
      star.setAttribute('aria-hidden','true');star.textContent='✦';
      star.style.setProperty('--x',Math.cos(angle)*(65+i*3)+'px');
      star.style.setProperty('--y',Math.sin(angle)*(65+i*2)+'px');
      star.style.color=['#d6ff83','#fd9eca','#c0a1ff'][i%3];
      dialog.append(star);
    }
  }
}
let audioContext, chime;
function armAudio(){
  try {
    audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
    audioContext.resume().catch(()=>{});
    if(!chime) chime=fetch(new URL('../assets/coupon-stars.wav',import.meta.url)).then(r=>r.arrayBuffer()).then(bytes=>audioContext.decodeAudioData(bytes)).catch(()=>null);
  }catch{}
}
function playChime(){
  if(!audioContext || audioContext.state!=='running') return;
  chime?.then(buffer=>{if(buffer && dialog?.open){const source=audioContext.createBufferSource();source.buffer=buffer;source.connect(audioContext.destination);source.start();}});
}
function visibleList(){
  if(document.hidden) return null;
  for(const list of [...document.querySelectorAll('[data-coupon-box] .subscription-plans')].reverse()){
    const r=list.getBoundingClientRect(),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);
    if(bottom-top<Math.min(48,r.height)) continue;
    if(list.contains(document.elementFromPoint(r.left+r.width/2,top+(bottom-top)/2))) return list;
  }
  return null;
}
async function showFor(list){
  if(busy || dialog || !couponStore.session?.token) return;
  busy=true;
  try {
    await requestCoupon('show');
    if(left() && !state.applied && list===visibleList()) displayCoupon();
    paintOffers();
  } catch {retryAfter=Date.now()+5000;}
  finally {busy=false;}
}
export function initSaleCountdown(store){
  if(!store) return;
  couponStore=store;
  window.addEventListener('pointerdown',armAudio,{once:true,capture:true});
  window.addEventListener('keydown',armAudio,{once:true,capture:true});
  function tick(){
    if(dialog && (!left() || state.applied)) closeCoupon();
    paintOffers();
    if(dialog || busy || !store.session?.token) return;
    if(state?.key===store.session.key && (state.applied || (Number.isFinite(state.deadline) && !left()))) return;
    const list=visibleList();
    if(list!==lastList){lastList=list;visibleSince=performance.now();}
    if(list && performance.now()-visibleSince>=1000 && Date.now()>=retryAfter) void showFor(list);
  }
  document.addEventListener('click',e=>{
    const list=e.target.closest?.('[data-plan]')?.closest('[data-coupon-box] .subscription-plans');
    if(!list || !store.session?.token || Date.now()<retryAfter || (state?.key===store.session.key && (state.applied || (Number.isFinite(state.deadline) && !left())))) return;
    e.preventDefault();e.stopImmediatePropagation();void showFor(list);
  },true);
  setInterval(tick,160);
}
export const money = value => Number(value).toLocaleString('ru-RU', { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 });
export const PLANS = {
  individual: { title: 'Для себя', oldPrice: 399, get price() { return saleActive() ? 299 : 399; }, detail: 'Один профиль' },
  family: { title: 'Для семьи', oldPrice: 999, get price() { return saleActive() ? 749 : 999; }, detail: 'До 4 человек · отдельный прогресс каждого' },
  quarter: { title: 'Для себя на 3 месяца', oldPrice: 897.75, get price() { return saleActive() ? 673 : 897.75; }, detail: 'Один профиль', months: 3 },
};
const period = plan => plan.months === 3 ? '3 месяца' : 'месяц';
const savings = value => 'Экономия ' + money(PLANS.individual.oldPrice * 3 - value) + ' ₽ по сравнению с тремя месяцами по обычной цене.';
const date = value => new Date(value).toLocaleDateString('ru-RU');
const message = error => ({ consent_required: 'Обновите страницу, чтобы увидеть актуальные условия оплаты.', unauthorized: 'Войдите в профиль заново.', invalid_email: 'Проверьте адрес почты.',
  payments_unavailable: 'Оплата пока не подключена.', already_active: 'У вас уже есть действующая подписка.',
  family_full: 'Все четыре места уже заняты или зарезервированы приглашениями.',
  invalid_invite: 'Приглашение истекло, уже использовано или отозвано.',
  checkout_method_pending: 'Предыдущий платёж ещё открыт. Продолжите выбранным ранее способом или дождитесь окончания срока оплаты.',
  checkout_in_progress: 'Есть незавершённая оплата другого тарифа. Напишите в поддержку, если хотите изменить выбор.' }[error.message]
  || 'Не удалось связаться с сервером. Попробуйте ещё раз.');

export function offerMarkup({ completed = false } = {}) {
  return `<div class="subscription-offer">
    <h2>${completed ? 'Ваша точка отсчёта готова' : 'Сделайте тренировку привычкой'}</h2>
    <p>Продолжайте тренировать функции мозга и отслеживайте результаты в удобных графиках, узнайте, как далеко вы сможете продвинуться!</p>
    <ul class="subscription-benefits"><li>Получите персональный разбор ваших результатов</li><li>Практические советы для повседневной жизни</li><li>Новые упражнения, уровни сложности</li><li>Замеры скорости чтения</li></ul>
    <div data-coupon-box><div data-coupon-head hidden><header class="bf-heading"><h3>Купон применён</h3><span>−25%</span></header><div class="bf-countdown"><p>До конца скидки</p>${clockMarkup()}</div></div>
    <div class="subscription-plans">${Object.entries(PLANS).map(([id, plan]) => `<button class="subscription-plan glass${id === 'individual' ? ' subscription-plan--primary is-spotlit' : ''}" data-plan="${id}"${id === 'quarter' ? ' style="grid-column:1/-1"' : ''}>
      <b>${plan.title}</b><span class="bf-old" hidden><s>${money(plan.oldPrice)} ₽</s><strong>−25%</strong></span><span class="subscription-plan__price"><span data-current-price>${money(plan.price)}</span> <small>₽ за ${period(plan)}</small></span><span>${plan.detail}</span>
      ${id === 'quarter' ? `<small data-quarter-savings>${savings(plan.price)}</small>` : ''}${id === 'family' ? `<small>Около <span data-family-price>${Math.ceil(plan.price/4)}</span> ₽ на человека, если вас четверо</small>` : ''}<strong>Выбрать</strong></button>`).join('')}</div></div>
    <p class="login__note">Разовая оплата за выбранный срок. Автоматических списаний нет.</p>
  </div>`;
}

export async function openSubscription(store, { plan: selected = null } = {}) {
  trackAction('subscription_open');
  const s = sheet('<h3 class="sheet__title">Подписка</h3><p class="sheet__text" role="status">Проверяем подписку…</p>');
  s.node.classList.add('subscription-sheet');
  const errorText = text => { const node = s.node.querySelector('[data-error]'); if (node) node.textContent = text; };
  const refresh = async () => { await store.refreshAccess(); await draw(); };
  async function draw() {
    try {
      const sub = await store.refreshAccess();
      if (!sub.active && !selected) {
        s.node.innerHTML = offerMarkup({ completed: sub.trial?.completed }) + (sub.in_family ? '<button class="link" data-leave>Выйти из прежней семьи</button>' : '') + '<p class="login__err" role="alert" data-error></p><button class="link" data-close>Позже</button>';
        s.node.querySelectorAll('[data-plan]').forEach(button => { button.onclick = () => { selected = button.dataset.plan; draw(); }; });
        bindClose();
        s.node.querySelector('[data-leave]')?.addEventListener('click', async () => {
          try { await store.billing('family-leave'); await refresh(); } catch (error) { errorText(message(error)); }
        });
        return;
      }
      if (sub.active) {
        s.node.innerHTML = `<h3 class="sheet__title">${sub.plan === 'family' ? 'Семейная подписка' : 'Ваша подписка'}</h3>
          <p class="sheet__text"><b>Доступ до ${date(sub.paid_until)}</b><br>${sub.family_member ? 'Ваш доступ оплачен владельцем семейной подписки.'
            : sub.auto_renew ? `Следующее продление — ${sub.price} ₽ за месяц после окончания оплаченного периода.` : 'Автопродление отключено. Новых списаний не будет.'}</p>
          ${!sub.family_member && sub.auto_renew ? '<button class="btn btn--glass btn--block" data-cancel>Отключить автопродление</button>' : ''}
          ${sub.plan === 'family' && !sub.family_member ? '<div data-family></div>' : ''}
          ${sub.in_family ? '<button class="link" data-leave>Выйти из семейной подписки</button>' : ''}
          <p class="login__err" role="alert" data-error></p><button class="link" data-close>Закрыть</button>`;
        bindClose();
        s.node.querySelector('[data-cancel]')?.addEventListener('click', async event => {
          if (!await confirmSheet({ title: 'Отключить автопродление?', text: `Доступ ${sub.plan === 'family' ? 'всей семьи ' : ''}останется до ${date(sub.paid_until)}.`, ok: 'Отключить' })) return;
          event.target.disabled = true;
          try { await store.billing('cancel'); await refresh(); } catch (error) { errorText(message(error)); event.target.disabled = false; }
        });
        s.node.querySelector('[data-leave]')?.addEventListener('click', async () => {
          if (!await confirmSheet({ title: 'Выйти из семьи?', text: 'Семейный доступ к тренировкам прекратится. Ваши результаты сохранятся.', ok: 'Выйти' })) return;
          try { await store.billing('family-leave'); selected = null; await refresh(); } catch (error) { errorText(message(error)); }
        });
        if (s.node.querySelector('[data-family]')) await drawFamily();
        return;
      }
      if (couponStore && state?.key !== store.session?.key) await requestCoupon('status').catch(()=>{});
      const promo = saleActive();
      const chosen = PLANS[selected] ? { ...PLANS[selected], price: PLANS[selected].price, consentVersion: promo ? 'coupon-10m-v1' : selected === 'quarter' ? 'quarter-v1-once' : 'monthly-plans-v4-once', sale: promo } : null;
      if (!chosen) { selected = null; return draw(); }
      s.node.innerHTML = `<button class="link" data-back>← Другой тариф</button><h3 class="sheet__title">${chosen.title}</h3>
        <p class="subscription-price">${chosen.sale ? `<s>${money(chosen.oldPrice)} ₽</s> <span class="bf-checkout-badge">−25%</span><br>` : ''}<b>${money(chosen.price)} ₽</b> за ${period(chosen)}</p><p class="sheet__text">${chosen.detail}${chosen.months === 3 ? ' · ' + savings(chosen.price) : ''}</p>
        ${sub.ready ? `<form data-checkout><label class="subscription-consent"><input type="checkbox" required name="consent"><span>Принимаю <a href="offer.html" target="_blank" rel="noopener">условия</a> и соглашаюсь на разовое списание ${money(chosen.price)} ₽ за ${period(chosen)} доступа. Автоматических списаний не будет. Ознакомлен с <a href="privacy.html" target="_blank" rel="noopener">политикой обработки данных</a>.</span></label>
          <div style="display:grid;gap:12px;margin-bottom:12px"><button class="btn btn--primary btn--lg btn--block" type="submit" data-method="sbp">Оплатить через СБП · ${money(chosen.price)} ₽</button>
          <button class="btn btn--glass btn--block" type="submit" data-method="auto">Картой или другим способом</button></div>
          <p class="login__note">Оплата покрывает выбранный срок доступа. Чтобы продолжить, позже оформите новую оплату.</p></form>` : '<p class="sheet__text">Оплата готовится к запуску.</p>'}
        <p class="login__err" role="alert" data-error></p><button class="link" data-close>Закрыть</button>`;
      trackAction(sub.ready ? 'checkout_form_' + selected : 'payments_unavailable');
      bindClose();
      s.node.querySelector('[data-back]').onclick = () => { selected = null; draw(); };
      s.node.querySelector('[data-checkout]')?.addEventListener('submit', async event => {
        event.preventDefault();
        if (chosen.sale !== saleActive()) { await draw(); errorText('Срок купона истёк. Проверьте новую цену перед оплатой.'); return; }
        const form = event.target; if (!form.reportValidity()) return;
        const buttons = [...form.querySelectorAll('button[type="submit"]')];
        if (buttons.some(item => item.disabled)) return;
        const button = event.submitter || buttons[0];
        const label = button.textContent;
        buttons.forEach(item => { item.disabled = true; }); button.textContent = 'Открываем оплату…';
        trackAction('checkout_submit_' + selected);
        try {
          const result = await store.billing('checkout', { 
            checkout_method: button.dataset.method, consent: form.elements.consent.checked, consent_version: chosen.consentVersion, plan: selected });
          if (result.confirmation_url) { trackAction('checkout_redirect'); await flushAnalytics(); location.assign(result.confirmation_url); }
          else { trackAction('checkout_processing'); errorText('Платёж обрабатывается. Доступ появится после подтверждения оплаты.'); }
        } catch (error) { trackAction('checkout_error'); errorText(message(error)); }
        finally { buttons.forEach(item => { item.disabled = false; }); button.textContent = label; }
      });
    } catch (error) {
      s.node.innerHTML = `<h3 class="sheet__title">Подписка</h3><p class="sheet__text" role="alert">${message(error)}</p><button class="btn btn--glass" data-retry>Повторить</button><button class="link" data-close>Закрыть</button>`;
      s.node.querySelector('[data-retry]').onclick = draw; bindClose();
    }
  }
  function bindClose() { s.node.querySelector('[data-close]').onclick = () => s.close(); }
  async function drawFamily() {
    const info = await store.billing('family-info');
    const host = s.node.querySelector('[data-family]');
    host.innerHTML = `<h4>Участники · ${info.members.length + 1} из 4</h4><p class="login__note">Вы — владелец. Каждый участник входит со своим логином и PIN; результаты хранятся отдельно.</p>
      ${info.members.map(member => `<div class="family-member"><span>${esc(member.name)}</span><button class="link" data-remove="${esc(member.key)}">Убрать</button></div>`).join('')}
      <button class="btn btn--glass btn--block" data-invite>Пригласить участника</button>
      <p class="login__note">Приглашение действует 7 дней и занимает одно место до использования или отзыва.</p>
      <div data-invite-link></div>${info.reserved ? '<button class="link" data-revoke>Отозвать неиспользованные приглашения</button>' : ''}`;
    host.querySelector('[data-invite]').onclick = async event => {
      event.target.disabled = true;
      try { const invite = await store.billing('family-invite');
        const box = host.querySelector('[data-invite-link]');
        box.innerHTML = '<label>Скопируйте ссылку и отправьте участнику</label><input class="input" readonly aria-label="Ссылка приглашения">';
        box.querySelector('input').value = invite.link;
        box.querySelector('input').select();
      } catch (error) { errorText(message(error)); }
      finally { event.target.disabled = false; }
    };
    host.querySelectorAll('[data-remove]').forEach(button => { button.onclick = async () => {
      if (!await confirmSheet({ title: 'Убрать участника?', text: 'Его семейный доступ прекратится; результаты сохранятся.', ok: 'Убрать' })) return;
      try { await store.billing('family-remove', { member_key: button.dataset.remove }); await drawFamily(); } catch (error) { errorText(message(error)); }
    }; });
    host.querySelector('[data-revoke]')?.addEventListener('click', async () => {
      try { await store.billing('family-revoke-invites'); await drawFamily(); } catch (error) { errorText(message(error)); }
    });
  }
  await draw();
}

export async function requireSubscription(store) {
  if (!BILLING.enabled) return true;
  try { if ((await store.refreshAccess()).active) return true; } catch { /* Show retryable panel. */ }
  await openSubscription(store); return false;
}

export async function finishPaymentReturn(store) {
  trackAction('payment_return');
  const s = sheet('<h3 class="sheet__title">Возвращаемся к тренировкам</h3><p class="sheet__text" role="status">Проверяем подписку…</p>');
  for (let attempt = 0; attempt < 12 && store.session; attempt++) {
    try {
      if ((await store.refreshAccess()).active) { trackAction('access_confirmed'); s.close(); await store.sync(); return; }
    } catch { /* A notification or network response may still be in flight. */ }
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  trackAction('payment_pending');
  s.node.innerHTML = '<h3 class="sheet__title">Платёж обрабатывается</h3><p class="sheet__text">Доступ откроется после подтверждения оплаты. Подписка проверяется автоматически при открытии сайта.</p><button class="btn btn--primary btn--block">На главную</button>';
  s.node.querySelector('button').onclick = s.close;
}

export async function acceptFamilyInvite(store) {
  let invite;
  try {
    const incoming = new URLSearchParams(location.hash.slice(1)).get('family');
    if (incoming && /^[a-f0-9]{64}$/.test(incoming)) { sessionStorage.setItem('nz.familyInvite', incoming); history.replaceState(null, '', location.pathname + location.search); }
    invite = sessionStorage.getItem('nz.familyInvite');
  } catch { return; }
  if (!invite || !store.session || !BILLING.enabled) return;
  try {
    await store.billing('family-join', { invite }); sessionStorage.removeItem('nz.familyInvite');
    await store.refreshAccess();
    const result = sheet('<h3 class="sheet__title">Добро пожаловать в семью!</h3><p class="sheet__text">Ваш профиль подключён. Тренировки и ваш личный прогресс доступны по семейной подписке.</p><button class="btn btn--primary btn--block">Продолжить</button>');
    result.node.querySelector('button').onclick = result.close;
  } catch (error) {
    sessionStorage.removeItem('nz.familyInvite');
    const result = sheet(`<p class="sheet__text">${message(error)}</p><button class="btn btn--glass">Закрыть</button>`);
    result.node.querySelector('button').onclick = result.close;
  }
}




