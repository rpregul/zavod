import { addDays, dayStr, fmtShort, parseDay } from './util.js';

let gid = 0;
const NS = 'http://www.w3.org/2000/svg';

// Линейный график с градиентной заливкой, анимацией «рисования» и подсказкой по касанию.
// points: [{day:'YYYY-MM-DD', y:number, n:number}]
export function lineChart(host, points, { color = '#ff7a45', color2 = '#ff4fa0', unit = '', lines = [] } = {}) {
  host.innerHTML = '';
  if (!points.length) {
    host.innerHTML = `<div class="empty"><div class="empty__art">📈</div><b>Пока нет данных</b><span>Сделай первую зарядку: график появится здесь</span></div>`;
    return () => {};
  }
  const id = `c${++gid}`;
  const W = Math.max(280, host.clientWidth || 320);
  const H = 190;
  const m = { l: 34, r: 14, t: 16, b: 26 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const ys = points.map((p) => p.y);
  const allY = ys.concat(lines.map((l) => l.y));
  const yMin = Math.min(...allY), yMax = Math.max(...allY);
  // «красивые» целые деления оси: шаг 1/2/5/10…, 3-5 делений
  const rawRange = Math.max(yMax - yMin, 1);
  const niceStep = [1, 2, 5, 10, 20, 50].find((st) => rawRange * 1.25 / st <= 4) || 100;
  const lo = Math.max(0, Math.floor((yMin - rawRange * 0.1) / niceStep) * niceStep);
  let hi = lo + niceStep * 2;
  while (hi < yMax + rawRange * 0.06) hi += niceStep;
  // по оси X: реальные даты, пропуски дней видны
  const d0 = points[0].day;
  const span = Math.max(1, Math.round((parseDay(points[points.length - 1].day) - parseDay(d0)) / 86400000));
  const xOf = (p) => m.l + (points.length === 1 ? iw / 2 : (Math.round((parseDay(p.day) - parseDay(d0)) / 86400000) / span) * iw);
  const yOf = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;
  const xy = points.map((p) => [xOf(p), yOf(p.y)]);

  // сглаженная кривая (Catmull-Rom → Bezier)
  let d = `M${xy[0][0]},${xy[0][1]}`;
  for (let i = 0; i < xy.length - 1; i++) {
    const p0 = xy[i - 1] || xy[i], p1 = xy[i], p2 = xy[i + 1], p3 = xy[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    const clampY = (v) => Math.min(m.t + ih, Math.max(m.t, v));
    d += ` C${c1[0]},${clampY(c1[1])} ${c2[0]},${clampY(c2[1])} ${p2[0]},${p2[1]}`;
  }
  const area = `${d} L${xy[xy.length - 1][0]},${m.t + ih} L${xy[0][0]},${m.t + ih} Z`;

  const ticks = Math.round((hi - lo) / niceStep);
  let grid = '';
  for (let i = 0; i <= ticks; i++) {
    const v = lo + niceStep * i;
    const y = yOf(v);
    grid += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" class="grid"/><text x="${m.l - 8}" y="${y + 4}" class="axis" text-anchor="end">${Math.round(v)}</text>`;
  }
  const refs = lines.map((l) => {
    const y = yOf(l.y);
    return `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" class="ref" style="--rc:${l.color}"/><text x="${W - m.r}" y="${l.below ? y + 12 : y - 5}" text-anchor="end" class="ref-t" style="--rc:${l.color}">${l.label}</text>`;
  }).join('');
  const labelIdx = points.length <= 3 ? points.map((_, i) => i) : [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const xl = [...new Set(labelIdx)].map((i) => {
    const anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
    return `<text x="${xy[i][0]}" y="${H - 6}" class="axis" text-anchor="${anchor}">${fmtShort(points[i].day)}</text>`;
  }).join('');

  const bestI = ys.indexOf(Math.max(...ys));
  const dots = xy.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === xy.length - 1 ? 5.5 : 3.6}" class="dot ${i === bestI ? 'best' : ''}" style="animation-delay:${600 + i * 40}ms"/>`).join('');
  const last = xy[xy.length - 1];

  host.innerHTML = `
    <div class="chart__tip" hidden></div>
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="chart__svg" role="img" aria-label="График результатов">
      <defs>
        <linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".38"/><stop offset="1" stop-color="${color2}" stop-opacity="0"/></linearGradient>
        <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color2}"/></linearGradient>
      </defs>
      ${grid}
      ${refs}
      <path d="${area}" fill="url(#${id}f)" class="area"/>
      <path d="${d}" fill="none" stroke="url(#${id}s)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" class="line" pathLength="1"/>
      ${dots}
      <circle cx="${last[0]}" cy="${last[1]}" r="5.5" class="pulse" style="--c:${color2}"/>
      <line class="cross" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" opacity="0"/>
      ${xl}
    </svg>`;

  const svg = host.querySelector('svg');
  const tip = host.querySelector('.chart__tip');
  const cross = svg.querySelector('.cross');
  const move = (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let bi = 0, bd = 1e9;
    xy.forEach((p, i) => { const dd = Math.abs(p[0] - px); if (dd < bd) { bd = dd; bi = i; } });
    const p = points[bi];
    cross.setAttribute('x1', xy[bi][0]);
    cross.setAttribute('x2', xy[bi][0]);
    cross.setAttribute('opacity', '1');
    tip.hidden = false;
    tip.innerHTML = `<b>${p.y}</b> ${unit}<span>${fmtShort(p.day)}${p.note ? ` · ${p.note}` : p.n > 1 ? ` · попыток: ${p.n}` : ''}</span>`;
    const tx = (xy[bi][0] / W) * r.width;
    tip.style.left = `${Math.min(r.width - 60, Math.max(60, tx))}px`;
  };
  const leave = () => { tip.hidden = true; cross.setAttribute('opacity', '0'); };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', leave);
  return () => {};
}

// Календарь-«тепловая карта» за 12 недель (колонки = недели, строки = пн..вс)
export function heatmap(host, daysMap, weeks = 12) {
  const today = dayStr();
  const dow = (new Date().getDay() + 6) % 7;
  const start = addDays(today, -dow - (weeks - 1) * 7);
  let cols = '';
  for (let w = 0; w < weeks; w++) {
    let col = '';
    for (let r = 0; r < 7; r++) {
      const day = addDays(start, w * 7 + r);
      const n = daysMap.get(day)?.size || 0;
      const future = day > today;
      col += `<i class="hm hm--${future ? 'f' : n}${day === today ? ' hm--today' : ''}" style="animation-delay:${(w * 7 + r) * 6}ms" title="${fmtShort(day)}${n ? ` · ${n}/4` : ''}"></i>`;
    }
    cols += `<div class="hm-col">${col}</div>`;
  }
  host.innerHTML = `<div class="hm-grid">${cols}</div>
    <div class="hm-legend"><span>меньше</span><i class="hm hm--0"></i><i class="hm hm--1"></i><i class="hm hm--2"></i><i class="hm hm--3"></i><i class="hm hm--4"></i><span>полная зарядка</span></div>`;
}

// Кольцо прогресса (0..1)
export function ringSvg(frac, { size = 96, stroke = 10, id = `r${++gid}`, c1 = '#ff9a3d', c2 = '#ff4fa0', inner = '' } = {}) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(120,100,180,.14)" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}" transform="rotate(-90 ${size / 2} ${size / 2})" class="ring__arc" style="--C:${C};--to:${C * (1 - frac)}"/>
    </svg><div class="ring__in">${inner}</div></div>`;
}

export { NS };
