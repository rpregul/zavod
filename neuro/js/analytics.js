import { CLOUD } from './config.js?v=1.1.2';
import { esc } from './util.js?v=1.1.2';

async function rpc(name, data) {
  const response = await fetch(CLOUD.url + '/rest/v1/rpc/' + name, {
    method: 'POST', headers: { apikey: CLOUD.key, Authorization: 'Bearer ' + CLOUD.key, 'Content-Type': 'application/json' },
    body: JSON.stringify(data), signal: AbortSignal.timeout(10000), cache: 'no-store',
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
    const f = data.funnel, steps = [['Посетили',f.visitors],['Зарегистрировались',f.registered],['Начали пробную',f.trial_started],['Завершили пробную',f.trial_completed],['Купили',f.buyers]];
    const date = value => new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day:'numeric',month:'short',hour:'2-digit',minute:'2-digit' });
    host.innerHTML = '<b>Воронка новых посетителей за 30 дней</b><br><small>Сбор начат: '+(data.tracking_started?date(data.tracking_started):'первых посещений ещё нет')+'. Доли — от предыдущего шага на текущий момент, это ещё не итоговая конверсия: участники могут продолжить позже.</small><dl>'+steps.map(([title,n],i)=>'<dt>'+title+'</dt><dd><b>'+n+'</b>'+(i?' · '+(steps[i-1][1]?Math.round(n/steps[i-1][1]*100)+'%':'—'):'')+'</dd>').join('')+'</dl><small>До входа считаем браузеры, после входа объединяем устройства по аккаунту. Очистка данных и блокировщики влияют на точность. Тестовые аккаунты и посещения владельца исключены.</small><hr><b>Вся история без тестовых аккаунтов</b><p>Регистрации: '+data.totals.registrations+' · начали пробную: '+data.totals.trial_started+' · завершили: '+data.totals.trial_completed+' · покупателей: '+data.totals.buyers+'</p><small>Это отдельные исторические итоги, они не входят в воронку новых посещений.</small><hr><b>Пробные тренировки</b><ul>'+data.trials.map(t=>'<li>'+esc(t.name)+' — '+(t.completed_at?'завершена':'в процессе, '+t.exercises+' из 4')+'<br><small>Начало: '+date(t.started_at)+'</small></li>').join('')+'</ul>';
  } catch { host.textContent = 'Не удалось загрузить статистику. Доступ есть только у владельца. Попробуйте войти повторно.'; }
}

