import { makeHud } from './ui.js?v=1.5.0';
import { haptic, sfx } from './fx.js?v=1.5.0';

const LIMIT = 400;
const FEEDBACK_MS = 750;
const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' });

const levels = [
  { step: 1000, count: 17, tolerance: 40 },
  { step: 100, count: 179, tolerance: 20 },
  { step: 1, count: 18500, tolerance: 8 },
];

export function marketProblem(previous, random = Math.random, level = 0) {
  const { step, count } = levels[level];
  const price = () => (1 + Math.floor(random() * count)) * step + (level === 2 ? 1000 : 0);
  const first = price();
  let second = price();
  if (previous?.first === first && previous.second === second) second += second > step ? -step : step;
  return { first, second, total: first + second };
}

export function marketPoints(guess, total, tolerance = levels[0].tolerance) {
  const excess = Math.max(0, Math.abs(Math.round(guess * 100) - total) / 100 - tolerance);
  return Math.max(0, 10 - Math.ceil(excess / tolerance));
}

export function runMarket(ctx, { step = '', trial = false } = {}) {
  return new Promise(resolve => {
    const duration = trial ? 30000 : 60000;
    const hud = makeHud(ctx, { label: 'Баллы', step });
    const stage = document.createElement('section');
    stage.className = 'market-stage';
    stage.setAttribute('aria-label', 'Рынок');
    stage.innerHTML = `
      <div class="market-board">
        <div class="market-receipt">
          <header class="market-heading"><span data-level></span><h2>Прикиньте сумму</h2></header>
          <div class="market-prices" aria-live="polite"><b data-first></b><b data-second></b></div>
          <p class="market-feedback" role="status" aria-atomic="true"></p>
        </div>
        <div class="market-ruler">
          <div class="market-scale">
            ${[400,300,200,100,0].map(value => `<span class="market-tick" style="--position:${100-value/LIMIT*100}%">${value}</span>`).join('')}
            <span class="market-exact" aria-hidden="true" hidden></span>
            <input class="market-slider" type="range" min="0" max="${LIMIT}" value="200" aria-label="Оценка суммы в рублях" aria-orientation="vertical">
          </div>
          <output class="market-guess">200 ₽</output>
        </div>
      </div>
      <button type="button" class="btn btn--primary btn--block market-submit">Проверить</button>
      <div class="market-pause glass" hidden><p>Раунд на паузе</p><button type="button" class="btn btn--primary">Продолжить</button></div>`;
    ctx.root.replaceChildren(hud.node, stage);
    const first = stage.querySelector('[data-first]');
    const second = stage.querySelector('[data-second]');
    const prices = stage.querySelector('.market-prices');
    const feedback = stage.querySelector('.market-feedback');
    const slider = stage.querySelector('input');
    const guess = stage.querySelector('output');
    const exact = stage.querySelector('.market-exact');
    const submit = stage.querySelector('.market-submit');
    const pause = stage.querySelector('.market-pause');
    const resume = pause.querySelector('button');
    let level = 0;
    let problem, score = 0, attempts = 0, totalError = 0, elapsed = 0;
    let since = performance.now(), frame, delay, animation;
    let locked = false, paused = false, finished = false;
    const used = () => elapsed + (paused ? 0 : performance.now() - since);

    function formatPrice(cents) {
      return cents % 100 === 0 ? (cents / 100) + ' ₽' : money.format(cents / 100);
    }

    function updateGuess() {
      stage.style.setProperty('--pick', (100 - Number(slider.value) / 4) + '%');
      guess.textContent = slider.value + ' ₽';
      slider.setAttribute('aria-valuetext', guess.textContent);
    }

    function next() {
      if (paused || finished || used() >= duration) return;
      locked = false;
      level = Math.min(2, Math.floor(used() / duration * 3));
      stage.querySelector('[data-level]').textContent = 'Уровень ' + (level + 1) + ' / 3';
      stage.style.setProperty('--band', (200 * levels[level].tolerance / LIMIT) + '%');
      problem = marketProblem(problem, Math.random, level);
      first.textContent = formatPrice(problem.first);
      second.textContent = formatPrice(problem.second);
      feedback.textContent = '';
      exact.hidden = true;
      slider.disabled = false;
      submit.disabled = false;
      stage.removeAttribute('data-answer');
      stage.removeAttribute('data-drag');
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        animation?.cancel();
        animation = prices.animate([{ opacity: .35, translate: '0 9px' }, { opacity: 1, translate: '0 0' }],
          { duration: 240, easing: 'ease-out' });
      }
    }

    function check() {
      if (locked || paused || finished || used() >= duration) return;
      locked = true;
      const value = Number(slider.value);
      const points = marketPoints(value, problem.total, levels[level].tolerance);
      attempts++;
      totalError += Math.abs(value * 100 - problem.total);
      score += points;
      hud.setScore(score);
      slider.disabled = true;
      submit.disabled = true;
      exact.style.setProperty('--position', (100 - problem.total / LIMIT) + '%');
      exact.textContent = formatPrice(problem.total);
      exact.hidden = false;
      stage.dataset.answer = points === 10 ? 'close' : 'miss';
      feedback.textContent = `Точная сумма ${money.format(problem.total / 100)}. +${points} баллов`;
      if (points === 10) { sfx('ok'); haptic(12); }
      delay = setTimeout(next, FEEDBACK_MS);
    }

    function cleanup() {
      cancelAnimationFrame(frame);
      clearTimeout(delay);
      animation?.cancel();
      document.removeEventListener('visibilitychange', visibility);
    }

    function finish(aborted = false) {
      if (finished) return;
      finished = true;
      cleanup();
      const averageError = attempts ? Math.round(totalError / attempts) / 100 : null;
      resolve(aborted ? null : {
        score,
        meta: { attempts, average_error: averageError, duration_ms: duration, level: level + 1 },
        extra: [
          { label: 'Оценок', value: attempts },
          { label: 'Средняя погрешность', value: averageError === null ? '—' : money.format(averageError) },
        ],
      });
    }

    function tick() {
      const ms = Math.min(duration, used());
      hud.setTime(duration - ms, ms / duration);
      if (ms >= duration) return finish();
      frame = requestAnimationFrame(tick);
    }

    function visibility() {
      if (document.visibilityState !== 'hidden' || paused || finished) return;
      elapsed = used();
      paused = true;
      cancelAnimationFrame(frame);
      clearTimeout(delay);
      pause.hidden = false;
      slider.disabled = true;
      submit.disabled = true;
    }

    slider.addEventListener('input', updateGuess);
    const field = stage.querySelector('.market-board');
    let pointer = null;
    function move(e) {
      const bounds = stage.querySelector('.market-scale').getBoundingClientRect();
      slider.value = String(Math.round(LIMIT * Math.max(0, Math.min(1, (bounds.bottom - e.clientY) / bounds.height))));
      updateGuess();
    }
    field.addEventListener('pointerdown', e => {
      if (locked || paused || finished || pointer !== null || e.button !== 0) return;
      e.preventDefault();
      pointer = e.pointerId;
      field.setPointerCapture(pointer);
      stage.dataset.drag = 'true';
      move(e);
    });
    field.addEventListener('pointermove', e => { if (e.pointerId === pointer) move(e); });
    field.addEventListener('pointerup', e => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      move(e);
      check();
    });
    field.addEventListener('lostpointercapture', () => {
      pointer = null;
      if (!locked) stage.removeAttribute('data-drag');
    });
    slider.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); check(); }
    });
    submit.addEventListener('click', check);
    resume.addEventListener('click', () => {
      if (!paused || finished) return;
      paused = false;
      since = performance.now();
      pause.hidden = true;
      if (locked) next();
      slider.disabled = false;
      submit.disabled = false;
      slider.focus({ preventScroll: true });
      tick();
    });
    ctx.onCleanup(cleanup);
    ctx.onAbort = () => finish(true);
    document.addEventListener('visibilitychange', visibility);
    updateGuess();
    next();
    tick();
    visibility();
  });
}
