import { el, shuffle } from './util.js';
import { makeHud, startTimer, countdown } from './ui.js';
import { haptic, sfx, sparkle } from './fx.js';

export const SCHULTE_MS = 60000;

// Таблица Шульте 5x5. reverse = таблица перевёрнута на 180° и счёт идёт от 25 к 1.
// Счёт = сколько чисел найдено за минуту. Закончил таблицу раньше: выдаём новую, счёт продолжается.
export function runSchulte(ctx, { reverse = false, step = '' } = {}) {
  return new Promise((resolve) => {
    ctx.onAbort = () => resolve(null);
    const root = ctx.root;
    root.innerHTML = '';
    const hud = makeHud(ctx, { label: 'Найдено', step });
    root.appendChild(hud.node);

    const stage = el('div', 'stage schulte pre');
    stage.innerHTML = `
      <div class="schulte__hint">Смотри в <b>центр</b>, ищи <span class="schulte__next">${reverse ? 25 : 1}</span></div>
      <div class="schulte__wrap"><div class="schulte__table${reverse ? ' flip' : ''}"></div></div>
      <div class="schulte__foot"><span>круг <b class="s-lap">1</b></span><span>ошибок <b class="s-err">0</b></span></div>`;
    root.appendChild(stage);

    const table = stage.querySelector('.schulte__table');
    const nextEl = stage.querySelector('.schulte__next');
    const lapEl = stage.querySelector('.s-lap');
    const errEl = stage.querySelector('.s-err');

    let target = reverse ? 25 : 1;
    let found = 0, errors = 0, lap = 1, playing = false;
    let lastHit = 0;
    const gaps = [];

    function build(animate) {
      const nums = shuffle(Array.from({ length: 25 }, (_, i) => i + 1));
      table.innerHTML = '';
      nums.forEach((n, i) => {
        const b = el('button', `cell${i === 12 && ctx.prefs.dot ? ' cell--fix' : ''}`, `<span>${n}</span>`);
        b.dataset.n = n;
        b.style.animationDelay = animate ? `${i * 14}ms` : '0ms';
        table.appendChild(b);
      });
      table.classList.toggle('swap', !!animate);
    }
    build(false);

    table.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest('.cell');
      if (!cell || !playing) return;
      e.preventDefault();
      const n = Number(cell.dataset.n);
      if (n === target) {
        const now = performance.now();
        gaps.push(now - lastHit);
        lastHit = now;
        found++;
        hud.setScore(found);
        cell.classList.remove('ok');
        void cell.offsetWidth;
        cell.classList.add('ok');
        const r = cell.getBoundingClientRect();
        sparkle(r.left + r.width / 2, r.top + r.height / 2, 6);
        haptic(8);
        sfx('tap');
        target += reverse ? -1 : 1;
        if (target < 1 || target > 25) {
          lap++;
          target = reverse ? 25 : 1;
          lapEl.textContent = lap;
          build(true);
          sfx('ok');
          haptic([10, 40, 10]);
        }
        nextEl.textContent = target;
        nextEl.classList.remove('pop');
        void nextEl.offsetWidth;
        nextEl.classList.add('pop');
      } else {
        errors++;
        errEl.textContent = errors;
        cell.classList.remove('bad');
        void cell.offsetWidth;
        cell.classList.add('bad');
        haptic([30, 40, 30]);
        sfx('bad');
      }
    });

    (async () => {
      await countdown(ctx, root);
      if (ctx.aborted) return;
      stage.classList.remove('pre');
      playing = true;
      lastHit = performance.now();
      startTimer(ctx, SCHULTE_MS, {
        onTick: (left, frac) => hud.setTime(left, frac),
        onEnd: async () => {
          playing = false;
          stage.classList.add('over');
          haptic([20, 40, 20]);
          sfx('done');
          await new Promise((r) => setTimeout(r, 650));
          if (ctx.aborted) return;
          const avg = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length / 1000 : 0;
          resolve({
            score: found,
            meta: { laps: Math.floor(found / 25), errors, avg: Number(avg.toFixed(2)) },
            extra: [
              { label: 'Кругов', value: Math.floor(found / 25) },
              { label: 'Ошибок', value: errors },
              { label: 'Сек. на число', value: avg ? avg.toFixed(2) : '—' },
            ],
          });
        },
      });
    })();
  });
}
