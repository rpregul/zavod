import { store, cloudOn } from './store.js';
import * as S from './stats.js';
import { el, esc, plural, dayStr, fmtLong, fmtShort, weekdayName, sleep } from './util.js';
import { glyph, gi } from './icons.js';
import { initFx, initRipple, confetti, haptic, sfx, countUp, toast } from './fx.js';
import { lineChart, heatmap, ringSvg } from './charts.js';
import { makeCtx, sheet, confirmSheet } from './ui.js';
import { runSchulte } from './schulte.js';
import { runDobble } from './dobble.js';
import { runMemory } from './memory.js';

// ---------------------------------------------------------------- упражнения
export const EX = {
  sch_f: {
    id: 'sch_f', title: 'Шульте', sub: 'от 1 до 25', icon: 'grid', color: 'orange', unit: 'чисел', c1: '#ff9a3d', c2: '#ff5e63',
    lead: 'Периферическое зрение и скорость чтения',
    rules: ['Смотри только на подсвеченный центр таблицы', 'Находи числа по порядку: 1, 2, 3 … 25', 'Глаза не двигай. Таблица закончилась? Выдадим новую'],
    run: (ctx, o) => runSchulte(ctx, { ...o, reverse: false }),
  },
  sch_r: {
    id: 'sch_r', title: 'Шульте вверх ногами', sub: 'от 25 до 1', icon: 'gridRev', color: 'pink', unit: 'чисел', c1: '#ff4fa0', c2: '#b24bf3',
    lead: 'Гибкость внимания и обратный счёт',
    rules: ['Таблица перевёрнута, цифры вверх ногами', 'Ищи числа в обратном порядке: 25, 24, 23 … 1', 'Смотри в центр, не двигай глазами'],
    run: (ctx, o) => runSchulte(ctx, { ...o, reverse: true }),
  },
  dob: {
    id: 'dob', title: 'Dobble', sub: 'найди пару', icon: 'cards', color: 'violet', unit: 'пар', c1: '#8b5cf6', c2: '#4f7cff',
    lead: 'Скорость зрительного поиска и переключения',
    rules: ['На двух картах всегда есть ровно один одинаковый рисунок', 'Найди его и нажми. Общая карта ляжет на твою, откроется следующая', 'За минуту набери как можно больше пар. Ошибка = короткая пауза'],
    run: (ctx, o) => runDobble(ctx, o),
  },
  mem: {
    id: 'mem', title: 'Запоминание слов', sub: '30 слов, цепочка', icon: 'words', color: 'teal', unit: 'слов из 30', c1: '#22c5a5', c2: '#4f7cff',
    lead: 'Рабочая память и точность',
    rules: ['Минуту смотри на 3 столбика по 10 слов', 'В голове строй цепочку образов: слово за словом', 'Потом минуту записывай слова в точности, с окончаниями'],
    run: (ctx, o) => runMemory(ctx, o),
  },
};
const ORDER = ['sch_f', 'sch_r', 'dob', 'mem'];

// ---------------------------------------------------------------- каркас экранов
const app = document.getElementById('app');
let screen = 'none';
let wake = null;

function mount(node, name, { quiet = false } = {}) {
  screen = name;
  app.innerHTML = '';
  node.classList.add('screen');
  if (!quiet) node.classList.add('enter');
  app.appendChild(node);
  window.scrollTo(0, 0);
  return node;
}

async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) wake = await navigator.wakeLock.request('screen');
    else if (!on && wake) { await wake.release(); wake = null; }
  } catch { /* ignore */ }
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
};
const fmtTime = (ts) => {
  const d = new Date(ts);
  const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return dayStr(d) === dayStr() ? `сегодня, ${t}` : `${fmtShort(dayStr(d))}, ${t}`;
};
const sign = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

// ---------------------------------------------------------------- вход
function renderLogin() {
  const node = el('div', 'login');
  let step = 'name', name = '', pin = '', first = '', msg = '', busy = false;

  const dots = () => `<div class="pin-dots">${[0, 1, 2, 3].map((i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join('')}</div>`;
  const keypad = () => `<div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, 'x'].map((k) => (k === '' ? '<span></span>' : `<button class="key" data-k="${k}" aria-label="${k === 'x' ? 'Стереть' : k}">${k === 'x' ? glyph.back : k}</button>`)).join('')}</div>`;

  function draw() {
    if (step === 'name') {
      node.innerHTML = `
        <div class="login__hero">
          <div class="login__logo">${gi('brain', 'orange', 'xl')}</div>
          <h1>Нейро-<span class="grad">зарядка</span></h1>
          <p>Утро без рилсов. Четыре упражнения на 5 минут, и день начат осознанно.</p>
        </div>
        <form class="login__card glass" autocomplete="off">
          <label for="nm">Как тебя зовут?</label>
          <input id="nm" class="input" type="text" maxlength="30" placeholder="Например, Рома" autocomplete="given-name" autocapitalize="words" enterkeyhint="next" value="${esc(name)}">
          <div class="login__err" role="alert">${msg}</div>
          <button class="btn btn--primary btn--lg btn--block" type="submit">Дальше ${glyph.arrow}</button>
          <p class="login__note">Без паролей и почты: только имя и 4 цифры. Те же имя и PIN на другом телефоне покажут твою историю.</p>
        </form>`;
      const input = node.querySelector('#nm');
      node.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = input.value.trim();
        if (!v) { msg = 'Напиши имя'; draw(); return; }
        name = v; pin = ''; first = ''; msg = ''; step = 'pin'; draw();
      });
      setTimeout(() => input.focus({ preventScroll: true }), 350);
      return;
    }
    const title = step === 'pin' ? `Привет, ${esc(name)}!` : 'Профиля с таким именем ещё нет';
    const sub = step === 'pin' ? 'Введи свой PIN из 4 цифр' : `Повтори PIN, и мы создадим профиль «${esc(name)}»`;
    node.innerHTML = `
      <div class="login__hero login__hero--sm">
        <div class="login__logo">${gi('user', 'violet', 'xl')}</div>
        <h2>${title}</h2>
        <p>${sub}</p>
      </div>
      <div class="login__card glass">
        ${dots()}
        <div class="login__err" role="alert">${msg}</div>
        ${keypad()}
        <button class="link" data-act="other">${step === 'pin' ? 'Это не я, другое имя' : 'Ошибся в имени'}</button>
      </div>`;
  }

  async function submitPin() {
    busy = true;
    try {
      if (step === 'pin') {
        const r = await store.login(name, pin);
        if (r.status === 'ok') return done();
        if (r.status === 'no_user') { first = pin; pin = ''; step = 'confirm'; msg = ''; return draw(); }
        fail({ bad_pin: 'Неверный PIN. Попробуй ещё раз', locked: 'Слишком много попыток. Подожди 10 минут', offline: 'Нет связи, а этого имени ещё нет на этом телефоне', invalid: 'Что-то не так с именем' }[r.status] || 'Не получилось войти');
      } else {
        if (pin !== first) { first = ''; pin = ''; step = 'pin'; msg = 'PIN не совпал. Введи его заново'; return draw(); }
        const r = await store.login(name, pin, { create: true });
        if (r.status === 'created' || r.status === 'ok') return done(true);
        fail(r.status === 'offline' ? 'Нет связи с сервером. Попробуй позже' : 'Не получилось создать профиль');
      }
    } finally { busy = false; }
  }
  function fail(text) {
    msg = text; pin = '';
    haptic([40, 50, 40]);
    draw();
    node.querySelector('.pin-dots')?.classList.add('shake');
  }
  function done(isNew) {
    haptic([12, 30, 12]);
    renderHome();
    toast(isNew ? `Добро пожаловать, ${esc(store.session.name)}! 🎉` : `С возвращением, ${esc(store.session.name)}!`);
  }

  function press(k) {
    if (busy) return;
    if (k === 'x') pin = pin.slice(0, -1);
    else if (pin.length < 4) pin += k;
    haptic(6);
    msg = '';
    const d = node.querySelectorAll('.pin-dots i');
    d.forEach((x, i) => x.classList.toggle('on', i < pin.length));
    node.querySelector('.login__err').textContent = '';
    if (pin.length === 4) setTimeout(submitPin, 140);
  }

  node.addEventListener('click', (e) => {
    const k = e.target.closest('.key');
    if (k) return press(k.dataset.k);
    if (e.target.closest('[data-act="other"]')) { step = 'name'; pin = ''; first = ''; msg = ''; draw(); }
  });
  const onKey = (e) => {
    if (screen !== 'login' || step === 'name') return;
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('x');
  };
  document.addEventListener('keydown', onKey);
  draw();
  mount(node, 'login');
}

// ---------------------------------------------------------------- главная (дашборд)
let chartEx = (() => { try { return sessionStorage.getItem('nz.chartEx') || 'sch_f'; } catch { return 'sch_f'; } })();

function renderHome({ quiet = false } = {}) {
  if (!store.session) return renderLogin();
  const res = store.results;
  const done = S.doneToday(res);
  const streak = S.streak(res);
  const full = S.fullDays(res);
  const week = S.weekStrip(res);
  const name = store.session.name;
  const left = ORDER.filter((id) => !done.has(id));
  const allDone = left.length === 0;
  const startedCount = done.size;

  const node = el('div', 'home');
  const tileHtml = ORDER.map((id, i) => {
    const e = EX[id];
    const b = S.best(res, id);
    const today = res.filter((r) => r.ex === id && r.day === dayStr()).reduce((m, r) => Math.max(m, r.score), -1);
    const right = today >= 0
      ? `<span class="tile__badge ok">${glyph.check}<b>${today}</b></span>`
      : b !== null ? `<span class="tile__best"><small>рекорд</small><b>${b}</b></span>` : `<span class="tile__new">новое</span>`;
    return `<button class="tile glass" data-ex="${id}" style="--i:${i}">
      ${gi(e.icon, e.color)}
      <span class="tile__txt"><b>${e.title}</b><small>${e.sub}</small></span>
      ${right}
    </button>`;
  }).join('');

  node.innerHTML = `
    <header class="top">
      <div class="top__hello"><small>${weekdayName()}, ${fmtLong()}</small><h1>${greeting()},<br><span class="grad">${esc(name)}</span></h1></div>
      <button class="avatar glass-btn" data-act="settings" aria-label="Настройки">${esc(name.trim()[0]?.toUpperCase() || '?')}<i class="sync-dot" data-sync></i></button>
    </header>

    <div class="home__cols">
    <div class="home__col">
    <section class="hero glass" style="--i:0">
      <div class="hero__ring">${ringSvg(startedCount / 4, { size: 104, stroke: 11, inner: `<b>${startedCount}</b><small>из 4</small>` })}</div>
      <div class="hero__txt">
        <h2>${allDone ? 'Зарядка сделана!' : startedCount ? 'Продолжим зарядку' : 'Утренняя зарядка'}</h2>
        <p>${allDone ? 'Мозг разогрет. Можно повторить и побить рекорд.' : 'Четыре упражнения, около 8 минут'}</p>
      </div>
      <button class="btn btn--primary btn--lg btn--shine hero__cta" data-act="session">${glyph.play}<span>${allDone ? 'Ещё раз' : startedCount ? 'Продолжить' : 'Начать зарядку'}</span></button>
    </section>

    <section class="chips-row" style="--i:1">
      <div class="stat glass">${gi('flame', 'orange', 'sm')}<span><b>${streak}</b><small>${plural(streak, 'день', 'дня', 'дней')} подряд</small></span></div>
      <div class="stat glass">${gi('trophy', 'lime', 'sm')}<span><b>${full}</b><small>${plural(full, 'полная зарядка', 'полные зарядки', 'полных зарядок')}</small></span></div>
      <div class="stat glass">${gi('target', 'blue', 'sm')}<span><b>${res.length}</b><small>${plural(res.length, 'попытка', 'попытки', 'попыток')}</small></span></div>
    </section>

    <section class="sec" style="--i:2">
      <h3 class="sec__t">Упражнения</h3>
      <div class="tiles">${tileHtml}</div>
    </section>

    </div>
    <div class="home__col">
    <section class="sec" style="--i:3">
      <h3 class="sec__t">Мой прогресс</h3>
      <div class="progress glass">
        <div class="seg" role="tablist">${ORDER.map((id) => `<button class="seg__b${id === chartEx ? ' on' : ''}" data-chart="${id}" role="tab">${EX[id].title.replace('Шульте вверх ногами', 'Шульте ↕').replace('Запоминание слов', 'Память')}</button>`).join('')}</div>
        <div class="kpis" data-kpis></div>
        <div class="chart" data-chart-host></div>
      </div>
    </section>

    <section class="sec" style="--i:4">
      <h3 class="sec__t">Постоянство</h3>
      <div class="consistency glass">
        <div class="week">${week.map((d) => `<div class="wd${d.today ? ' today' : ''}${d.future ? ' future' : ''}"><i class="wd__c wd__c--${d.n}">${d.n === 4 ? glyph.check : d.n ? d.n : ''}</i><small>${d.label}</small></div>`).join('')}</div>
        <div class="heat" data-heat></div>
      </div>
    </section>

    <section class="sec" style="--i:5" data-history></section>
    </div>
    </div>
    <div data-install></div>
    <footer class="foot">Нейро-зарядка · данные ${cloudOn() ? 'синхронизируются между устройствами' : 'хранятся на этом устройстве'}</footer>`;

  mount(node, 'home', { quiet });
  node.querySelectorAll('.ring__arc').forEach((a) => {
    void a.getBoundingClientRect();
    requestAnimationFrame(() => { a.style.strokeDashoffset = a.style.getPropertyValue('--to'); });
  });
  paintChart(node);
  heatmap(node.querySelector('[data-heat]'), S.daysMap(res));
  paintHistory(node);
  paintInstallHint(node);
  paintSync();

  node.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-ex],[data-act],[data-chart]');
    if (!t) return;
    if (t.dataset.ex) return runSingle(t.dataset.ex);
    if (t.dataset.chart) {
      chartEx = t.dataset.chart;
      try { sessionStorage.setItem('nz.chartEx', chartEx); } catch { /* ignore */ }
      node.querySelectorAll('.seg__b').forEach((b) => b.classList.toggle('on', b.dataset.chart === chartEx));
      return paintChart(node);
    }
    if (t.dataset.act === 'session') return runSession();
    if (t.dataset.act === 'settings') return openSettings();
  });
}

function paintChart(node) {
  const res = store.results;
  const e = EX[chartEx];
  const pts = S.dayBest(res, chartEx).slice(-30);
  const b = S.best(res, chartEx);
  const avg = S.avgWindow(res, chartEx, 0, 7);
  const tr = S.trend(res, chartEx);
  const total = S.byEx(res, chartEx).length;
  const trHtml = tr === null ? '<b>—</b><small>тренд появится через неделю</small>' : `<b class="${tr >= 0 ? 'up' : 'down'}">${tr >= 0 ? '↑' : '↓'} ${Math.abs(tr).toFixed(1)}</b><small>к прошлой неделе</small>`;
  node.querySelector('[data-kpis]').innerHTML = `
    <div><b>${b ?? '—'}</b><small>рекорд</small></div>
    <div><b>${avg === null ? '—' : avg.toFixed(1)}</b><small>среднее за 7 дн.</small></div>
    <div>${trHtml}</div>
    <div><b>${total}</b><small>попыток</small></div>`;
  lineChart(node.querySelector('[data-chart-host]'), pts, { color: e.c1, color2: e.c2, unit: e.unit });
}

function paintHistory(node) {
  const host = node.querySelector('[data-history]');
  const last = store.results.slice().sort((a, b) => b.ts - a.ts).slice(0, 8);
  if (!last.length) { host.innerHTML = ''; return; }
  host.innerHTML = `<h3 class="sec__t">Последние попытки</h3><div class="history glass">${last.map((r) => {
    const e = EX[r.ex];
    if (!e) return '';
    return `<div class="h-row">${gi(e.icon, e.color, 'xs')}<span class="h-row__t"><b>${e.title}</b><small>${fmtTime(r.ts)}</small></span><span class="h-row__v"><b>${r.score}</b><small>${e.unit.split(' ')[0]}</small></span></div>`;
  }).join('')}</div>`;
}

function paintInstallHint(node) {
  const host = node.querySelector('[data-install]');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let dismissed = false;
  try { dismissed = localStorage.getItem('nz.hint') === '1'; } catch { /* ignore */ }
  if (standalone || dismissed) return;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (!ios && !deferredInstall) return;
  host.innerHTML = `<div class="hint glass">${gi('share', 'blue', 'sm')}<p>${ios ? 'Добавь на экран «Домой»: <b>Поделиться → На экран «Домой»</b>. Тогда зарядка откроется одним нажатием, как приложение.' : 'Установи зарядку на телефон, чтобы открывать её одним нажатием.'}</p>
    ${ios ? '' : '<button class="btn btn--primary btn--sm" data-install-btn>Установить</button>'}<button class="hint__x" aria-label="Скрыть">${glyph.close}</button></div>`;
  host.querySelector('.hint__x').addEventListener('click', () => { try { localStorage.setItem('nz.hint', '1'); } catch { /* ignore */ } host.innerHTML = ''; });
  host.querySelector('[data-install-btn]')?.addEventListener('click', async () => { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; host.innerHTML = ''; });
}
let deferredInstall = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });

function paintSync() {
  const dots = document.querySelectorAll('[data-sync]');
  const st = !cloudOn() ? 'local' : store.status;
  dots.forEach((d) => { d.className = `sync-dot sync-dot--${st}`; d.title = { local: 'Данные только на этом устройстве', ok: 'Синхронизировано', syncing: 'Синхронизация…', offline: 'Нет связи, синхронизируем позже', authfail: 'Не удалось войти в облако', idle: '' }[st] || ''; });
}

// ---------------------------------------------------------------- настройки
function openSettings() {
  const p = store.prefs;
  const st = !cloudOn() ? 'Облако не подключено: история хранится только в этом браузере' : { ok: 'Всё синхронизировано', syncing: 'Синхронизация…', offline: 'Нет связи, синхронизируем при появлении', authfail: 'Не удалось войти в облако', idle: 'Облако подключено' }[store.status];
  const s = sheet(`
    <div class="set__head">${gi('user', 'violet', 'sm')}<span><b>${esc(store.session.name)}</b><small>${st}</small></span></div>
    <div class="set__list">
      <label class="set"><span>${gi('vibe', 'orange', 'xs')}Вибрация</span><input type="checkbox" data-pref="haptics" ${p.haptics ? 'checked' : ''}><i class="sw"></i></label>
      <label class="set"><span>${gi('sound', 'pink', 'xs')}Звуки</span><input type="checkbox" data-pref="sound" ${p.sound ? 'checked' : ''}><i class="sw"></i></label>
      <label class="set"><span>${gi('eye', 'teal', 'xs')}Точка-ориентир в центре таблицы</span><input type="checkbox" data-pref="dot" ${p.dot ? 'checked' : ''}><i class="sw"></i></label>
    </div>
    <div class="sheet__actions sheet__actions--col">
      <button class="btn btn--glass" data-set="export">${glyph.download}<span>Скачать мои результаты</span></button>
      <button class="btn btn--glass" data-set="logout">${glyph.logout}<span>Выйти из профиля</span></button>
    </div>`);
  s.node.addEventListener('change', (e) => {
    const k = e.target.dataset.pref;
    if (!k) return;
    store.setPref(k, e.target.checked);
    if (k === 'sound' && e.target.checked) sfx('ok');
    if (k === 'haptics' && e.target.checked) haptic(30);
  });
  s.node.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-set]');
    if (!b) return;
    if (b.dataset.set === 'export') {
      const url = URL.createObjectURL(new Blob([store.exportJson()], { type: 'application/json' }));
      const a = el('a');
      a.href = url;
      a.download = `neuro-zaryadka-${dayStr()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } else if (b.dataset.set === 'logout') {
      s.close();
      if (await confirmSheet({ title: 'Выйти из профиля?', text: 'История останется. Войдёшь снова по имени и PIN.', ok: 'Выйти', danger: true })) {
        store.logout();
        renderLogin();
      }
    }
  });
}

// ---------------------------------------------------------------- прохождение упражнения
function introScreen(id, { guided, idx }) {
  return new Promise((resolve) => {
    const e = EX[id];
    const node = el('div', 'intro');
    node.innerHTML = `
      <div class="intro__top">
        <button class="glass-btn" data-r="back" aria-label="Назад">${glyph.back}</button>
        ${guided ? `<div class="steps">${ORDER.map((_, i) => `<i class="${i < idx ? 'done' : i === idx ? 'now' : ''}"></i>`).join('')}</div><span class="steps__n">${idx + 1} / 4</span>` : ''}
      </div>
      <div class="intro__hero">
        <div class="intro__icon">${gi(e.icon, e.color, 'xxl')}</div>
        <h2>${e.title}</h2>
        <p class="intro__lead">${e.lead}</p>
      </div>
      <ol class="rules glass">${e.rules.map((r, i) => `<li style="--i:${i}"><b>${i + 1}</b><span>${r}</span></li>`).join('')}</ol>
      <div class="intro__time">${glyph.clock}<span>${id === 'mem' ? '1 минута запоминаем + 1 минута пишем' : '1 минута'}</span></div>
      <button class="btn btn--primary btn--lg btn--block btn--shine" data-r="go">${glyph.play}<span>Поехали</span></button>`;
    mount(node, 'intro');
    node.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-r]');
      if (!b) return;
      resolve(b.dataset.r === 'go' ? 'start' : 'back');
    });
  });
}

function resultScreen(id, rec, res, { guided, idx, isLast }) {
  return new Promise((resolve) => {
    const e = EX[id];
    const all = store.results;
    const prevBest = S.bestBefore(all, id, rec.ts);
    const prev = S.lastBefore(all, id, rec.ts);
    const record = prevBest !== null && rec.score > prevBest;
    const first = prev === null;
    let chip;
    if (first) chip = '<span class="delta delta--first">Первая попытка: твоя точка отсчёта</span>';
    else if (record) chip = `<span class="delta delta--rec">🏆 Новый рекорд! ${sign(rec.score - prevBest)}</span>`;
    else {
      const d = rec.score - prev.score;
      chip = d > 0 ? `<span class="delta delta--up">↑ ${sign(d)} к прошлой попытке</span>` : d < 0 ? `<span class="delta delta--down">↓ ${sign(d)} к прошлой попытке</span>` : '<span class="delta">Как в прошлый раз</span>';
    }
    const next = guided && !isLast ? EX[ORDER[idx + 1]] : null;
    const node = el('div', 'result');
    node.innerHTML = `
      <div class="result__top">${gi(e.icon, e.color, 'lg')}<h2>${e.title}</h2></div>
      <div class="score glass">
        <div class="score__n"><b data-count>0</b></div>
        <div class="score__u">${e.unit}</div>
        ${chip}
        <div class="score__best">рекорд: <b>${Math.max(prevBest ?? 0, rec.score)}</b></div>
      </div>
      <div class="xstats">${(res.extra || []).map((x) => `<div class="xstat glass"><b>${x.value}</b><small>${x.label}</small></div>`).join('')}</div>
      ${res.detail ? `<div class="detail glass">${res.detail}</div>` : ''}
      <div class="result__actions">
        ${guided ? `<button class="btn btn--primary btn--lg btn--block btn--shine" data-r="next"><span>${next ? `Дальше: ${next.title}` : 'Завершить зарядку'}</span>${glyph.arrow}</button>` : ''}
        <div class="row2">
          <button class="btn btn--glass" data-r="again">Ещё раз</button>
          ${guided ? '' : '<button class="btn btn--glass" data-r="home">На главную</button>'}
        </div>
      </div>`;
    mount(node, 'result');
    countUp(node.querySelector('[data-count]'), rec.score, { dur: 900 });
    setTimeout(() => {
      if (record) { confetti({ count: 150 }); sfx('done'); haptic([20, 40, 20, 40, 30]); }
      else if (first || rec.score > 0) sfx('ok');
    }, 650);
    node.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-r]');
      if (b) resolve(b.dataset.r);
    });
  });
}

// возвращает {rec, action} либо null, если вышли
async function playOne(id, { guided = false, idx = 0 } = {}) {
  for (;;) {
    const go = await introScreen(id, { guided, idx });
    if (go === 'back') return null;
    for (;;) {
      const root = el('div', 'play');
      mount(root, 'play');
      const ctx = makeCtx(root, store.prefs);
      ctx.requestQuit = async () => {
        if (ctx.aborted) return;
        if (await confirmSheet({ title: 'Выйти из упражнения?', text: 'Результат этой попытки не сохранится.', ok: 'Выйти', cancel: 'Продолжить', danger: true })) ctx.abort();
      };
      await keepAwake(true);
      const res = await EX[id].run(ctx, { step: guided ? `${idx + 1} / 4` : '' });
      await keepAwake(false);
      if (!res) return null;
      const rec = store.add(id, res.score, res.meta);
      const action = await resultScreen(id, rec, res, { guided, idx, isLast: idx === ORDER.length - 1 });
      if (action === 'again') continue;
      return { rec, action };
    }
  }
}

async function runSingle(id) {
  const r = await playOne(id);
  renderHome();
  if (r && r.action === 'home') return;
}

async function runSession() {
  const startIdx = 0;
  const recs = [];
  for (let i = startIdx; i < ORDER.length; i++) {
    const r = await playOne(ORDER[i], { guided: true, idx: i });
    if (!r) { renderHome(); return; }
    recs.push(r.rec);
  }
  await summaryScreen(recs);
  renderHome();
}

function summaryScreen(recs) {
  return new Promise((resolve) => {
    const records = recs.filter((r) => {
      const pb = S.bestBefore(store.results, r.ex, r.ts);
      return pb !== null && r.score > pb;
    }).length;
    const streak = S.streak(store.results);
    const node = el('div', 'summary');
    node.innerHTML = `
      <div class="summary__hero">
        <div class="summary__emoji">${records ? '🏆' : '🌅'}</div>
        <h2>Зарядка завершена!</h2>
        <p>${records ? `Рекордов за сегодня: ${records}. Отличный старт дня.` : 'Мозг разогрет, день начат без рилсов. Это уже победа.'}</p>
      </div>
      <div class="sum-list glass">${recs.map((r, i) => {
        const e = EX[r.ex];
        const prev = S.lastBefore(store.results, r.ex, r.ts);
        const pb = S.bestBefore(store.results, r.ex, r.ts);
        const d = prev ? r.score - prev.score : null;
        const rec = pb !== null && r.score > pb;
        return `<div class="sum-row" style="--i:${i}">${gi(e.icon, e.color, 'sm')}<span class="sum-row__t"><b>${e.title}</b><small>${d === null ? 'первая попытка' : d === 0 ? 'как в прошлый раз' : `${sign(d)} к прошлой`}</small></span><span class="sum-row__v">${rec ? '<i class="star">★</i>' : ''}<b>${r.score}</b></span></div>`;
      }).join('')}</div>
      <div class="summary__streak glass">${gi('flame', 'orange', 'sm')}<span><b>${streak} ${plural(streak, 'день', 'дня', 'дней')} подряд</b><small>Приходи завтра утром, не сбрасывай серию</small></span></div>
      <button class="btn btn--primary btn--lg btn--block btn--shine" data-r="home">К моему дашборду ${glyph.arrow}</button>`;
    mount(node, 'summary');
    setTimeout(() => { confetti({ count: 180 }); setTimeout(() => confetti({ count: 120, x: innerWidth * 0.2 }), 250); setTimeout(() => confetti({ count: 120, x: innerWidth * 0.8 }), 450); sfx('done'); haptic([20, 40, 20, 40, 40]); }, 300);
    node.querySelector('[data-r]').addEventListener('click', () => resolve());
  });
}

// ---------------------------------------------------------------- запуск
function boot() {
  initFx();
  initRipple();
  store.load();
  let lastCount = store.results.length;
  store.on(() => {
    paintSync();
    if (screen === 'home' && store.results.length !== lastCount) { lastCount = store.results.length; renderHome({ quiet: true }); }
    lastCount = store.results.length;
  });
  if (store.session) { renderHome(); store.sync(); } else renderLogin();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && store.session) {
      store.sync();
      if (screen === 'home' && app.dataset.day !== dayStr()) { app.dataset.day = dayStr(); renderHome({ quiet: true }); }
    }
  });
  app.dataset.day = dayStr();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  // для отладки и тестов
  window.__nz = { store, S, EX };
}

boot();
