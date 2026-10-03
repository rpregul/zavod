import { el, shuffle, mulberry32, sleep } from './util.js';
import { makeHud, startTimer, countdown } from './ui.js';
import { haptic, sfx, sparkle, floatText } from './fx.js';
import { SYMBOLS, ensureSprite } from './symbols/index.js';

export const DOBBLE_MS = 60000;
const N = 7; // порядок проективной плоскости: 8 символов на карточке, 57 карточек, 57 символов

// Классическая конструкция Dobble/Spot it!: у любых двух карточек ровно один общий символ.
export function buildCards() {
  const cards = [];
  cards.push(Array.from({ length: N + 1 }, (_, i) => i));
  for (let j = 0; j < N; j++) {
    const c = [0];
    for (let k = 0; k < N; k++) c.push(N + 1 + N * j + k);
    cards.push(c);
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const c = [i + 1];
      for (let k = 0; k < N; k++) c.push(N + 1 + N * k + ((i * k + j) % N));
      cards.push(c);
    }
  }
  return cards;
}
export const CARDS = buildCards();

export const commonSymbol = (a, b) => CARDS[a].find((s) => CARDS[b].includes(s));

// Фиксированная раскладка символов на карточке (как на настоящей карточке):
// разные размеры и повороты, без пересечений. Детерминирована по номеру карточки.
export function layoutCard(cardIdx) {
  const rnd = mulberry32(cardIdx * 2654435761 + 977);
  const base = [0.36, 0.315, 0.285, 0.255, 0.235, 0.212, 0.195, 0.18];
  let scale = 1;
  for (let attempt = 0; attempt < 400; attempt++) {
    const radii = shuffle(base, rnd).map((r) => r * scale * (0.93 + rnd() * 0.14));
    const it = radii.map((r) => {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * (0.9 - r);
      return { r, x: Math.cos(a) * d, y: Math.sin(a) * d };
    });
    for (let k = 0; k < 500; k++) {
      let moved = 0;
      for (let i = 0; i < it.length; i++) {
        for (let j = i + 1; j < it.length; j++) {
          const dx = it[j].x - it[i].x, dy = it[j].y - it[i].y;
          const d = Math.hypot(dx, dy) || 1e-6;
          const min = it[i].r + it[j].r + 0.014;
          if (d < min) {
            const push = (min - d) / 2, ux = dx / d, uy = dy / d;
            it[i].x -= ux * push; it[i].y -= uy * push;
            it[j].x += ux * push; it[j].y += uy * push;
            moved += push;
          }
        }
      }
      for (const p of it) {
        const d = Math.hypot(p.x, p.y), lim = 0.95 - p.r;
        if (d > lim) { p.x *= lim / d; p.y *= lim / d; moved += d - lim; }
      }
      if (moved < 1e-6) break;
    }
    let ok = true;
    for (let i = 0; i < it.length && ok; i++) {
      if (Math.hypot(it[i].x, it[i].y) + it[i].r > 0.965) ok = false;
      for (let j = i + 1; j < it.length && ok; j++) {
        if (Math.hypot(it[i].x - it[j].x, it[i].y - it[j].y) < it[i].r + it[j].r + 0.006) ok = false;
      }
    }
    if (ok) return it.map((p) => ({ ...p, rot: rnd() * 360 }));
    scale *= 0.985;
  }
  // запасной вариант: кольцо из 7 символов и один в центре
  return Array.from({ length: 8 }, (_, i) => {
    if (i === 7) return { r: 0.22, x: 0, y: 0, rot: 0 };
    const a = (i / 7) * Math.PI * 2;
    return { r: 0.2, x: Math.cos(a) * 0.62, y: Math.sin(a) * 0.62, rot: rnd() * 360 };
  });
}

const layoutCache = new Map();
const getLayout = (idx) => {
  if (!layoutCache.has(idx)) layoutCache.set(idx, layoutCard(idx));
  return layoutCache.get(idx);
};

export function cardHtml(cardIdx, { rotate = 0 } = {}) {
  const lay = getLayout(cardIdx);
  const syms = CARDS[cardIdx].map((symIdx, i) => {
    const p = lay[i];
    const k = (2 * p.r) / 92;
    return `<g class="sym" data-s="${symIdx}" transform="translate(${p.x.toFixed(4)} ${p.y.toFixed(4)}) rotate(${p.rot.toFixed(1)}) scale(${k.toFixed(5)}) translate(-50 -50)"><use href="#sy-${symIdx}"/><circle cx="50" cy="50" r="50" fill="transparent"/></g>`;
  }).join('');
  return `<svg viewBox="-1.03 -1.03 2.06 2.06" class="dcard__svg" style="transform:rotate(${rotate}deg)"><circle r="1" class="dcard__bg"/>${syms}</svg>`;
}

function makeCard(cardIdx) {
  const c = el('div', 'dcard', cardHtml(cardIdx, { rotate: Math.floor(Math.random() * 360) }));
  c.dataset.card = cardIdx;
  return c;
}

export function runDobble(ctx, { step = '' } = {}) {
  return new Promise((resolve) => {
    ensureSprite();
    ctx.onAbort = () => resolve(null);
    const root = ctx.root;
    root.innerHTML = '';
    const hud = makeHud(ctx, { label: 'Пар', step });
    root.appendChild(hud.node);

    const stage = el('div', 'stage dob pre');
    stage.innerHTML = `
      <div class="dob__slot dob__slot--center"><span class="dob__tag">общая карта</span><div class="dob__holder"></div></div>
      <div class="dob__slot dob__slot--mine"><span class="dob__tag">твоя карта</span><div class="dob__holder"></div></div>
      <div class="dob__help">Найди одинаковый рисунок на двух картах и нажми на него</div>`;
    root.appendChild(stage);
    const centerHolder = stage.querySelector('.dob__slot--center .dob__holder');
    const mineHolder = stage.querySelector('.dob__slot--mine .dob__holder');

    const deck = shuffle(Array.from({ length: CARDS.length }, (_, i) => i)).slice(0, 55);
    let mine = deck.pop();
    let center = deck.pop();
    let mineEl = makeCard(mine);
    let centerEl = makeCard(center);
    mineHolder.appendChild(mineEl);
    centerHolder.appendChild(centerEl);

    let score = 0, errors = 0, playing = false, locked = false;
    let lastAt = 0;
    const times = [];

    const pulse = (nodes, cls) => nodes.forEach((n) => { n.classList.remove(cls); void n.getBoundingClientRect(); n.classList.add(cls); });

    async function success(symIdx, tapped) {
      locked = true;
      const common = [mineEl, centerEl].map((c) => c.querySelector(`.sym[data-s="${symIdx}"]`));
      common.forEach((g) => g.classList.add('hit'));
      const r = tapped.getBoundingClientRect();
      sparkle(r.left + r.width / 2, r.top + r.height / 2, 9);
      floatText(r.left + r.width / 2, r.top, '+1', 'ft-ok');
      score++;
      const now = performance.now();
      times.push(now - lastAt);
      lastAt = now;
      hud.setScore(score);
      haptic(12);
      sfx('ok');

      await sleep(140);
      if (ctx.aborted) return;
      // общая карта «забирается»: ложится на твою, из колоды открывается новая
      const dy = mineEl.getBoundingClientRect().top - centerEl.getBoundingClientRect().top;
      const moving = centerEl;
      moving.style.zIndex = '5';
      await moving.animate(
        [{ transform: 'translateY(0) scale(1)' }, { transform: `translateY(${dy}px) scale(1.02)` }, { transform: `translateY(${dy}px) scale(1)` }],
        { duration: 260, easing: 'cubic-bezier(.3,.9,.3,1)', fill: 'forwards' },
      ).finished.catch(() => {});
      if (ctx.aborted) return;
      mineEl.remove();
      moving.getAnimations().forEach((a) => a.cancel());
      moving.style.zIndex = '';
      moving.querySelectorAll('.sym.hit').forEach((g) => g.classList.remove('hit'));
      mineHolder.appendChild(moving);
      mineEl = moving;
      mine = center;

      if (!deck.length) { finish(); return; }
      center = deck.pop();
      centerEl = makeCard(center);
      centerEl.classList.add('deal');
      centerHolder.appendChild(centerEl);
      locked = false;
    }

    function fail(tapped) {
      locked = true;
      errors++;
      tapped.classList.add('miss');
      pulse([mineEl, centerEl], 'shake');
      haptic([35, 45, 35]);
      sfx('bad');
      setTimeout(() => {
        tapped.classList.remove('miss');
        locked = false;
      }, 650);
    }

    stage.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('.sym');
      if (!g || !playing || locked) return;
      e.preventDefault();
      const symIdx = Number(g.dataset.s);
      if (symIdx === commonSymbol(mine, center)) success(symIdx, g);
      else fail(g);
    });

    let timerRef;
    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      playing = false;
      timerRef?.stop();
      stage.classList.add('over');
      haptic([20, 40, 20]);
      sfx('done');
      setTimeout(() => {
        if (ctx.aborted) return;
        const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length / 1000 : 0;
        resolve({
          score,
          meta: { errors, avg: Number(avg.toFixed(2)) },
          extra: [
            { label: 'Ошибок', value: errors },
            { label: 'Сек. на пару', value: avg ? avg.toFixed(1) : '—' },
          ],
        });
      }, 650);
    }

    (async () => {
      await countdown(ctx, root);
      if (ctx.aborted) return;
      stage.classList.remove('pre');
      playing = true;
      lastAt = performance.now();
      timerRef = startTimer(ctx, DOBBLE_MS, {
        onTick: (left, frac) => hud.setTime(left, frac),
        onEnd: finish,
      });
    })();
  });
}

export { SYMBOLS };
