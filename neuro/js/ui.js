import { el, sleep } from './util.js';
import { haptic, sfx } from './fx.js';
import { glyph } from './icons.js';

// Контекст упражнения: корень экрана, настройки, возможность прервать.
export function makeCtx(root, prefs) {
  const ctx = {
    root, prefs, aborted: false, cleanups: [], onAbort: null,
    abort() {
      if (ctx.aborted) return;
      ctx.aborted = true;
      ctx.cleanups.forEach((f) => { try { f(); } catch { /* ignore */ } });
      ctx.cleanups = [];
      ctx.onAbort?.();
    },
    onCleanup(f) { ctx.cleanups.push(f); },
  };
  return ctx;
}

// таймер на requestAnimationFrame: не «плывёт» как setInterval
export function startTimer(ctx, ms, { onTick, onEnd }) {
  const t0 = performance.now();
  let raf = 0, stopped = false;
  const loop = (now) => {
    if (stopped) return;
    const elapsed = now - t0;
    const left = Math.max(0, ms - elapsed);
    onTick?.(left, elapsed / ms);
    if (left <= 0) { stopped = true; onEnd?.(); return; }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  const stop = () => { stopped = true; cancelAnimationFrame(raf); };
  ctx.onCleanup(stop);
  return { stop, elapsed: () => performance.now() - t0 };
}

// Шапка упражнения: крестик, кольцо-таймер, счёт
export function makeHud(ctx, { label = 'Счёт', step = '' } = {}) {
  const C = 2 * Math.PI * 25;
  const node = el('div', 'hud', `
    <button class="hud__x glass-btn" aria-label="Выйти">${glyph.close}</button>
    <div class="hud__mid">
      ${step ? `<div class="hud__step">${step}</div>` : ''}
      <div class="timer">
        <svg viewBox="0 0 60 60" width="64" height="64">
          <defs><linearGradient id="tg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9a3d"/><stop offset="1" stop-color="#ff4fa0"/></linearGradient></defs>
          <circle cx="30" cy="30" r="25" fill="none" stroke="rgba(120,100,180,.16)" stroke-width="5"/>
          <circle class="timer__arc" cx="30" cy="30" r="25" fill="none" stroke="url(#tg)" stroke-width="5" stroke-linecap="round"
            stroke-dasharray="${C}" stroke-dashoffset="0" transform="rotate(-90 30 30)"/>
        </svg>
        <b class="timer__n">60</b>
      </div>
    </div>
    <div class="hud__score"><small>${label}</small><b class="hud__val">0</b></div>`);
  const arc = node.querySelector('.timer__arc');
  const num = node.querySelector('.timer__n');
  const val = node.querySelector('.hud__val');
  const timer = node.querySelector('.timer');
  node.querySelector('.hud__x').addEventListener('click', () => ctx.requestQuit?.());
  return {
    node,
    setTime(leftMs, frac) {
      arc.setAttribute('stroke-dashoffset', String(C * frac));
      const s = Math.ceil(leftMs / 1000);
      if (num.textContent !== String(s)) {
        num.textContent = s;
        if (s <= 5 && s > 0) { sfx('tick'); timer.classList.remove('beat'); void timer.offsetWidth; timer.classList.add('beat'); }
      }
      timer.classList.toggle('low', s <= 10);
    },
    setScore(n) {
      val.textContent = n;
      val.classList.remove('bump');
      void val.offsetWidth;
      val.classList.add('bump');
    },
    setLabel(t) { node.querySelector('.hud__score small').textContent = t; },
  };
}

// 3-2-1-Поехали
export async function countdown(ctx, host, { text = ['3', '2', '1', 'Поехали!'] } = {}) {
  const ov = el('div', 'countdown');
  host.appendChild(ov);
  for (let i = 0; i < text.length; i++) {
    if (ctx.aborted) break;
    const n = el('div', `countdown__n${i === text.length - 1 ? ' go' : ''}`, text[i]);
    ov.innerHTML = '';
    ov.appendChild(n);
    haptic(i === text.length - 1 ? [20, 30, 20] : 14);
    sfx(i === text.length - 1 ? 'go' : 'tap');
    await sleep(i === text.length - 1 ? 520 : 760);
  }
  ov.remove();
}

// Нижняя «шторка» (подтверждения, настройки)
export function sheet(html, { onClose } = {}) {
  const root = document.getElementById('sheet-root');
  const wrap = el('div', 'sheet-wrap');
  wrap.innerHTML = `<div class="sheet-back"></div><div class="sheet glass" role="dialog" aria-modal="true"><div class="sheet__grip"></div>${html}</div>`;
  root.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('in'));
  const close = () => {
    wrap.classList.remove('in');
    setTimeout(() => { wrap.remove(); onClose?.(); }, 320);
  };
  wrap.querySelector('.sheet-back').addEventListener('click', close);
  return { node: wrap.querySelector('.sheet'), close };
}

export function confirmSheet({ title, text = '', ok = 'Да', cancel = 'Отмена', danger = false }) {
  return new Promise((resolve) => {
    const s = sheet(`
      <h3 class="sheet__title">${title}</h3>
      ${text ? `<p class="sheet__text">${text}</p>` : ''}
      <div class="sheet__actions">
        <button class="btn btn--glass" data-r="0">${cancel}</button>
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-r="1">${ok}</button>
      </div>`);
    let done = false;
    s.node.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b || done) return;
      done = true;
      s.close();
      resolve(b.dataset.r === '1');
    });
    s.node.parentElement.querySelector('.sheet-back').addEventListener('click', () => { if (!done) { done = true; resolve(false); } });
  });
}
