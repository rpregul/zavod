import { el, esc, sleep } from './util.js';
import { makeHud, startTimer, countdown } from './ui.js';
import { haptic, sfx } from './fx.js';
import { pickWords } from './words.js';
import { glyph } from './icons.js';

export const MEMORY_MS = 60000;

export const norm = (w) => w.toLowerCase().replace(/ё/g, 'е').trim();

export function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

const commonPrefix = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };

// Сверка: точное совпадение (с точностью до регистра и ё/е) / «почти» (ошибка в окончании или букве) / лишнее / пропущено
export function evaluate(columns, typed) {
  const targets = columns.flatMap((col, c) => col.map((w, r) => ({ w, c, r, state: 'miss', typed: null })));
  const used = new Set();
  typed.forEach((t, ti) => {
    const nt = norm(t);
    const hit = targets.find((x) => x.state === 'miss' && norm(x.w) === nt);
    if (hit) { hit.state = 'ok'; hit.typed = t; used.add(ti); }
  });
  typed.forEach((t, ti) => {
    if (used.has(ti)) return;
    const nt = norm(t);
    let best = null, bd = 99;
    for (const x of targets) {
      if (x.state !== 'miss') continue;
      const nw = norm(x.w);
      const d = lev(nt, nw);
      const near = d <= 2 || (commonPrefix(nt, nw) >= 4 && d <= 3);
      if (near && d < bd) { bd = d; best = x; }
    }
    if (best) { best.state = 'near'; best.typed = t; used.add(ti); }
  });
  const extra = typed.filter((_, i) => !used.has(i));
  return {
    targets,
    extra,
    ok: targets.filter((x) => x.state === 'ok').length,
    near: targets.filter((x) => x.state === 'near').length,
  };
}

function diffHtml(correct, typed) {
  const a = norm(correct), b = norm(typed);
  const p = commonPrefix(a, b);
  return `<b>${esc(typed.slice(0, p))}</b><u>${esc(typed.slice(p)) || '·'}</u>`;
}

export function reviewHtml(ev, columns) {
  const cols = columns.map((col, c) => {
    const rows = ev.targets.filter((t) => t.c === c).map((t) => {
      if (t.state === 'ok') return `<div class="rw rw--ok"><i>${glyph.check}</i><span>${esc(t.w)}</span></div>`;
      if (t.state === 'near') return `<div class="rw rw--near"><i>≈</i><span>${esc(t.w)}<small>ты: ${diffHtml(t.w, t.typed)}</small></span></div>`;
      return `<div class="rw rw--miss"><i>${glyph.close}</i><span>${esc(t.w)}</span></div>`;
    }).join('');
    return `<div class="rcol">${rows}</div>`;
  }).join('');
  const extra = ev.extra.length ? `<div class="rextra"><b>Лишние слова:</b> ${ev.extra.map((w) => `<span>${esc(w)}</span>`).join('')}</div>` : '';
  return `<div class="review"><div class="rcols">${cols}</div>${extra}<p class="review__note">≈ слово записано не в точности (окончание или буква). В зачёт идут только точные совпадения.</p></div>`;
}

export function runMemory(ctx, { step = '' } = {}) {
  return new Promise((resolve) => {
    ctx.onAbort = () => resolve(null);
    const root = ctx.root;
    root.innerHTML = '';
    const hud = makeHud(ctx, { label: 'Запоминай', step });
    root.appendChild(hud.node);
    const stage = el('div', 'stage mem');
    root.appendChild(stage);

    const words = pickWords(30);
    const columns = [words.slice(0, 10), words.slice(10, 20), words.slice(20, 30)];

    // ---- 1. запоминание ----
    function showWords() {
      stage.className = 'stage mem mem--show';
      stage.innerHTML = `
        <div class="mem__cols">${columns.map((col, c) => `
          <div class="wcol glass wcol--${c}" style="animation-delay:${c * 90}ms">
            ${col.map((w, r) => `<div class="w" style="animation-delay:${c * 90 + r * 45}ms"><i>${r + 1}</i><span>${esc(w)}</span></div>`).join('')}
          </div>`).join('')}
        </div>
        <p class="mem__tip">Строй в голове цепочку: каждое слово связывай с соседним ярким образом</p>
        <button class="btn btn--glass mem__skip">Я запомнил, дальше</button>`;
      hud.setScore('30');
      let gone = false;
      const next = () => { if (gone) return; gone = true; t.stop(); bridge(); };
      const t = startTimer(ctx, MEMORY_MS, {
        onTick: (left, frac) => hud.setTime(left, frac),
        onEnd: next,
      });
      stage.querySelector('.mem__skip').addEventListener('click', next);
    }

    // ---- 2. пауза: слова скрыты, ждём нажатия (нужно для открытия клавиатуры на телефоне) ----
    function bridge() {
      if (ctx.aborted) return;
      haptic([16, 30, 16]);
      sfx('done');
      stage.className = 'stage mem mem--bridge';
      stage.innerHTML = `
        <div class="bridge glass">
          <div class="bridge__emoji">🧠</div>
          <h3>Слова спрятаны</h3>
          <p>Теперь минута, чтобы записать как можно больше слов <b>в точности</b> (с окончаниями). Порядок не важен.</p>
          <button class="btn btn--primary btn--lg bridge__go">Начать запись</button>
        </div>`;
      hud.setLabel('Записано');
      hud.setScore(0);
      hud.setTime(MEMORY_MS, 0);
      stage.querySelector('.bridge__go').addEventListener('click', recall);
    }

    // ---- 3. запись ----
    function recall() {
      stage.className = 'stage mem mem--recall';
      stage.innerHTML = `
        <div class="recall glass">
          <div class="chips"></div>
          <input class="recall__in" type="text" inputmode="text" enterkeyhint="done" autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="пиши слово и жми пробел" aria-label="Слово">
        </div>
        <p class="mem__tip">Пробел или Enter: следующее слово. Нажми на слово, чтобы убрать.</p>
        <button class="btn btn--primary btn--lg recall__done">Готово</button>`;
      const input = stage.querySelector('.recall__in');
      const chips = stage.querySelector('.chips');
      const typed = [];

      const refresh = () => hud.setScore(typed.length);
      function commit(raw) {
        const w = raw.trim().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
        if (!w) return;
        const n = norm(w);
        const dupe = typed.findIndex((x) => norm(x) === n);
        if (dupe >= 0) {
          const c = chips.children[dupe];
          c.classList.remove('dupe'); void c.offsetWidth; c.classList.add('dupe');
          haptic(20);
          return;
        }
        if (typed.length >= 45) return;
        typed.push(w);
        const c = el('button', 'chip', esc(w));
        c.type = 'button';
        c.addEventListener('click', () => {
          const i = [...chips.children].indexOf(c);
          typed.splice(i, 1);
          c.remove();
          refresh();
          input.focus();
        });
        chips.appendChild(c);
        chips.parentElement.scrollTop = chips.parentElement.scrollHeight;
        sfx('tap');
        haptic(8);
        refresh();
      }
      input.addEventListener('input', () => {
        const v = input.value;
        if (/[\s,;]/.test(v)) {
          const parts = v.split(/[\s,;]+/);
          const rest = parts.pop();
          parts.forEach(commit);
          input.value = rest;
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(input.value); input.value = ''; }
        if (e.key === 'Backspace' && !input.value && typed.length) {
          typed.pop();
          chips.lastElementChild?.remove();
          refresh();
        }
      });
      let ended = false;
      const end = async () => {
        if (ended) return;
        ended = true;
        commit(input.value);
        input.value = '';
        input.blur();
        t.stop();
        haptic([20, 40, 20]);
        sfx('done');
        await sleep(400);
        if (ctx.aborted) return;
        const ev = evaluate(columns, typed);
        resolve({
          score: ev.ok,
          meta: { near: ev.near, extra: ev.extra.length, typed: typed.length },
          extra: [
            { label: 'Почти', value: ev.near },
            { label: 'Лишних', value: ev.extra.length },
            { label: 'Из', value: 30 },
          ],
          detail: reviewHtml(ev, columns),
        });
      };
      stage.querySelector('.recall__done').addEventListener('click', end);
      const t = startTimer(ctx, MEMORY_MS, {
        onTick: (left, frac) => hud.setTime(left, frac),
        onEnd: end,
      });
      input.focus();
    }

    (async () => {
      stage.className = 'stage mem pre';
      await countdown(ctx, root, { text: ['3', '2', '1', 'Запоминай!'] });
      if (ctx.aborted) return;
      showWords();
    })();
  });
}
