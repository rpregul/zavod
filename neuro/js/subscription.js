import { BILLING } from './config.js';
import { sheet, confirmSheet } from './ui.js';
import { esc } from './util.js';

const date = value => new Date(value).toLocaleDateString('ru-RU');
const message = error => ({ unauthorized: 'Войди в профиль заново.', invalid_email: 'Проверь адрес почты.',
  payments_unavailable: 'Оплата пока не подключена.', already_active: 'Подписка уже действует.' }[error.message] || 'Не удалось связаться с сервером. Попробуй ещё раз.');

export async function openSubscription(store) {
  const s = sheet('<h3 class="sheet__title">Подписка</h3><p class="sheet__text" role="status">Проверяем подписку…</p>');
  const draw = async () => {
    try {
      const sub = await store.billing('status');
      s.node.innerHTML = `<h3 class="sheet__title">Нейро-зарядка</h3>
        <p class="sheet__text">Четыре упражнения на внимание, зрительный поиск и запоминание. История результатов в твоём профиле.</p>
        ${sub.active ? `<p class="sheet__text"><b>Доступ до ${date(sub.paid_until)}</b><br>${sub.auto_renew ? 'Следующее списание — 299 ₽ после окончания оплаченного периода.' : 'Автопродление отключено. Новых списаний не будет.'}</p>
          ${sub.auto_renew ? '<button class="btn btn--glass btn--block" data-cancel>Отключить автопродление</button>' : ''}`
          : `<p class="subscription-price"><b>299 ₽</b> / месяц</p>
          ${sub.ready ? `<form data-checkout>
            <label for="billing-email">Почта для чека и связи</label>
            <input class="input" id="billing-email" type="email" required maxlength="254" autocomplete="email" value="${esc(sub.email || '')}" placeholder="you@example.ru">
            <label class="subscription-consent"><input type="checkbox" required name="consent"><span>Соглашаюсь с <a href="offer.html" target="_blank" rel="noopener">офертой</a> и списанием 299 ₽ каждый месяц до отключения автопродления. Ознакомлен с <a href="privacy.html" target="_blank" rel="noopener">политикой обработки данных</a>.</span></label>
            <button class="btn btn--primary btn--lg btn--block" type="submit">Подключить за 299 ₽</button>
            <p class="login__note">Первое списание — сейчас. Следующее — через месяц. Отключить автопродление можно здесь в любой момент.</p>
          </form>` : '<p class="sheet__text">Оплата готовится к запуску.</p>'}`}
        <p class="login__err" role="alert" data-error></p>
        <button class="btn btn--glass btn--block" data-refresh>Проверить оплату</button>
        <button class="link" data-close>Закрыть</button>`;
      s.node.querySelector('[data-close]').onclick = () => s.close();
      s.node.querySelector('[data-refresh]').onclick = draw;
      s.node.querySelector('[data-cancel]')?.addEventListener('click', async event => {
        if (!await confirmSheet({ title: 'Отключить автопродление?', text: `Доступ останется до ${date(sub.paid_until)}.`, ok: 'Отключить' })) return;
        event.target.disabled = true;
        try { await store.billing('cancel'); await draw(); }
        catch (error) { s.node.querySelector('[data-error]').textContent = message(error); event.target.disabled = false; }
      });
      s.node.querySelector('[data-checkout]')?.addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.target;
        if (!form.reportValidity()) return;
        const button = form.querySelector('button');
        button.disabled = true;
        button.textContent = 'Открываем оплату…';
        try {
          const result = await store.billing('checkout', { email: form.querySelector('input[type=email]').value,
            consent: form.elements.consent.checked, consent_version: BILLING.consentVersion });
          if (result.confirmation_url) location.assign(result.confirmation_url);
          else s.node.querySelector('[data-error]').textContent = 'Проверяем платёж. Нажми «Проверить оплату» через минуту.';
        } catch (error) { s.node.querySelector('[data-error]').textContent = message(error); }
        finally { button.disabled = false; button.textContent = 'Подключить за 299 ₽'; }
      });
    } catch (error) {
      s.node.innerHTML = `<h3 class="sheet__title">Подписка</h3><p class="sheet__text" role="alert">${message(error)}</p><button class="btn btn--glass" data-retry>Повторить</button><button class="link" data-close>Закрыть</button>`;
      s.node.querySelector('[data-retry]').onclick = draw;
      s.node.querySelector('[data-close]').onclick = () => s.close();
    }
  };
  await draw();
}

export async function requireSubscription(store) {
  if (!BILLING.enabled) return true;
  try { if ((await store.billing('status')).active) return true; } catch { /* Show a retryable account panel. */ }
  await openSubscription(store);
  return false;
}
