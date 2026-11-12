import { trackAction, flushAnalytics } from './analytics.js?v=1.2.2';
import { BILLING } from './config.js?v=1.1.2';
import { sheet, confirmSheet } from './ui.js?v=1.1.2';
import { esc } from './util.js?v=1.1.2';

export const PLANS = {
  individual: { title: 'Для себя', price: 299, detail: 'Один профиль' },
  family: { title: 'Для семьи', price: 599, detail: 'До 4 человек · отдельный прогресс каждого' },
};
const date = value => new Date(value).toLocaleDateString('ru-RU');
const message = error => ({ unauthorized: 'Войди в профиль заново.', invalid_email: 'Проверь адрес почты.',
  payments_unavailable: 'Оплата пока не подключена.', already_active: 'У тебя уже есть действующая подписка.',
  family_full: 'Все четыре места уже заняты или зарезервированы приглашениями.',
  invalid_invite: 'Приглашение истекло, уже использовано или отозвано.',
  checkout_in_progress: 'Есть незавершённая оплата другого тарифа. Напиши в поддержку, если хочешь изменить выбор.' }[error.message]
  || 'Не удалось связаться с сервером. Попробуй ещё раз.');

export function offerMarkup({ completed = false } = {}) {
  return `<div class="subscription-offer">
    <h2>${completed ? 'Твоя точка отсчёта готова' : 'Сделай тренировку привычкой'}</h2>
    <p>Продолжай тренировать внимание и память: получай подсказки по своим результатам и замечай прогресс от занятия к занятию.</p>
    <div class="subscription-benefits"><span>Персональные подсказки</span><span>История и динамика</span><span>Все текущие упражнения без ограничения повторов</span></div>
    <div class="subscription-plans">${Object.entries(PLANS).map(([id, plan]) => `<button class="subscription-plan glass${id === 'individual' ? ' subscription-plan--primary' : ''}" data-plan="${id}">
      <b>${plan.title}</b><span class="subscription-plan__price">${plan.price} <small>₽/месяц</small></span><span>${plan.detail}</span>
      ${id === 'family' ? '<small>Около 150 ₽ на человека, если вас четверо</small>' : ''}<strong>Выбрать</strong></button>`).join('')}</div>
    <p class="login__note">Разовая оплата за один месяц. Для следующего месяца нужно оформить оплату заново.</p>
  </div>`;
}

export async function openSubscription(store, { plan: selected = null } = {}) {
  trackAction('subscription_open');
  const s = sheet('<h3 class="sheet__title">Подписка</h3><p class="sheet__text" role="status">Проверяем подписку…</p>');
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
        s.node.innerHTML = `<h3 class="sheet__title">${sub.plan === 'family' ? 'Семейная подписка' : 'Твоя подписка'}</h3>
          <p class="sheet__text"><b>Доступ до ${date(sub.paid_until)}</b><br>${sub.family_member ? 'Твой доступ оплачен владельцем семейной подписки.'
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
          if (!await confirmSheet({ title: 'Выйти из семьи?', text: 'Семейный доступ к тренировкам прекратится. Твои результаты сохранятся.', ok: 'Выйти' })) return;
          try { await store.billing('family-leave'); selected = null; await refresh(); } catch (error) { errorText(message(error)); }
        });
        if (s.node.querySelector('[data-family]')) await drawFamily();
        return;
      }
      const chosen = PLANS[selected];
      if (!chosen) { selected = null; return draw(); }
      s.node.innerHTML = `<button class="link" data-back>← Другой тариф</button><h3 class="sheet__title">${chosen.title}</h3>
        <p class="subscription-price"><b>${chosen.price} ₽</b> / месяц</p><p class="sheet__text">${chosen.detail}</p>
        ${sub.ready ? `<form data-checkout><label class="subscription-consent"><input type="checkbox" required name="consent"><span>Принимаю <a href="offer.html" target="_blank" rel="noopener">условия</a> и соглашаюсь на разовое списание ${chosen.price} ₽ за один месяц доступа. Автоматических списаний не будет. Ознакомлен с <a href="privacy.html" target="_blank" rel="noopener">политикой обработки данных</a>.</span></label>
          <button class="btn btn--primary btn--lg btn--block" type="submit">Оплатить ${chosen.price} ₽</button>
          <p class="login__note">Оплата покрывает один месяц доступа. Чтобы продолжить пользоваться тренажёром, позже оформи новую оплату.</p></form>` : '<p class="sheet__text">Оплата готовится к запуску.</p>'}
        <p class="login__err" role="alert" data-error></p><button class="link" data-close>Закрыть</button>`;
      trackAction(sub.ready ? 'checkout_form_' + selected : 'payments_unavailable');
      bindClose();
      s.node.querySelector('[data-back]').onclick = () => { selected = null; draw(); };
      s.node.querySelector('[data-checkout]')?.addEventListener('submit', async event => {
        event.preventDefault(); const form = event.target; if (!form.reportValidity()) return;
        const button = form.querySelector('button'); button.disabled = true; button.textContent = 'Открываем оплату…';
        trackAction('checkout_submit_' + selected);
        try {
          const result = await store.billing('checkout', { 
            consent: form.elements.consent.checked, consent_version: BILLING.consentVersion, plan: selected });
          if (result.confirmation_url) { trackAction('checkout_redirect'); await flushAnalytics(); location.assign(result.confirmation_url); }
          else { trackAction('checkout_processing'); errorText('Платёж обрабатывается. Доступ появится после подтверждения оплаты.'); }
        } catch (error) { trackAction('checkout_error'); errorText(message(error)); }
        finally { button.disabled = false; button.textContent = `Оплатить ${chosen.price} ₽`; }
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
    host.innerHTML = `<h4>Участники · ${info.members.length + 1} из 4</h4><p class="login__note">Ты — владелец. Каждый участник входит со своим логином и PIN; результаты хранятся отдельно.</p>
      ${info.members.map(member => `<div class="family-member"><span>${esc(member.name)}</span><button class="link" data-remove="${esc(member.key)}">Убрать</button></div>`).join('')}
      <button class="btn btn--glass btn--block" data-invite>Пригласить участника</button>
      <p class="login__note">Приглашение действует 7 дней и занимает одно место до использования или отзыва.</p>
      <div data-invite-link></div>${info.reserved ? '<button class="link" data-revoke>Отозвать неиспользованные приглашения</button>' : ''}`;
    host.querySelector('[data-invite]').onclick = async event => {
      event.target.disabled = true;
      try { const invite = await store.billing('family-invite');
        const box = host.querySelector('[data-invite-link]');
        box.innerHTML = '<label>Скопируй ссылку и отправь участнику</label><input class="input" readonly aria-label="Ссылка приглашения">';
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
    const result = sheet('<h3 class="sheet__title">Добро пожаловать в семью!</h3><p class="sheet__text">Твой профиль подключён. Тренировки и твой личный прогресс доступны по семейной подписке.</p><button class="btn btn--primary btn--block">Продолжить</button>');
    result.node.querySelector('button').onclick = result.close;
  } catch (error) {
    sessionStorage.removeItem('nz.familyInvite');
    const result = sheet(`<p class="sheet__text">${message(error)}</p><button class="btn btn--glass">Закрыть</button>`);
    result.node.querySelector('button').onclick = result.close;
  }
}


