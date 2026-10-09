import { addDays, dayStr, diffDays } from './util.js';

export const EXS = ['sch_f', 'sch_r', 'dob', 'mem'];

export const byEx = (results, ex) => results.filter((r) => r.ex === ex).sort((a, b) => a.ts - b.ts);

export function best(results, ex) {
  let b = null;
  for (const r of results) if (r.ex === ex && (b === null || r.score > b)) b = r.score;
  return b;
}

// лучший результат до момента ts (для сравнения «рекорд / не рекорд»)
export function bestBefore(results, ex, ts) {
  let b = null;
  for (const r of results) if (r.ex === ex && r.ts < ts && (b === null || r.score > b)) b = r.score;
  return b;
}

export function lastBefore(results, ex, ts) {
  let p = null;
  for (const r of results) if (r.ex === ex && r.ts < ts && (!p || r.ts > p.ts)) p = r;
  return p;
}

// лучший результат за каждый день
export function dayBest(results, ex) {
  const m = new Map();
  for (const r of byEx(results, ex)) {
    const cur = m.get(r.day);
    if (!cur) m.set(r.day, { day: r.day, y: r.score, n: 1 });
    else { cur.y = Math.max(cur.y, r.score); cur.n++; }
  }
  return [...m.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

export function daysMap(results) {
  const m = new Map();
  for (const r of results) {
    if (!m.has(r.day)) m.set(r.day, new Set());
    m.get(r.day).add(r.ex);
  }
  return m;
}

export const doneToday = (results) => new Set(results.filter((r) => r.day === dayStr()).map((r) => r.ex));

// серия: подряд идущие дни, в которые сделано хотя бы одно упражнение.
// Если сегодня ещё ничего не делали, серия не обрывается до конца дня.
export function streak(results) {
  const days = daysMap(results);
  const today = dayStr();
  let cursor = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(cursor)) { n++; cursor = addDays(cursor, -1); }
  return n;
}

export function fullDays(results) {
  let n = 0;
  for (const set of daysMap(results).values()) if (set.size === EXS.length) n++;
  return n;
}

// среднее по лучшим результатам дней в окне [from, to) в днях назад
export function avgWindow(results, ex, fromAgo, toAgo) {
  const today = dayStr();
  const vals = dayBest(results, ex).filter((d) => {
    const ago = diffDays(today, d.day);
    return ago >= fromAgo && ago < toAgo;
  });
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v.y, 0) / vals.length;
}

export function trend(results, ex) {
  const cur = avgWindow(results, ex, 0, 7);
  const prev = avgWindow(results, ex, 7, 14);
  if (cur === null || prev === null) return null;
  return cur - prev;
}

export function weekStrip(results) {
  const days = daysMap(results);
  const today = dayStr();
  const d = new Date();
  const dow = (d.getDay() + 6) % 7; // пн = 0
  const monday = addDays(today, -dow);
  const names = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  return names.map((label, i) => {
    const day = addDays(monday, i);
    return { label, day, n: days.get(day)?.size || 0, today: day === today, future: day > today };
  });
}

// ---- Общий итог ----
// У упражнений разные единицы (числа, пары, слова), поэтому каждое переводим в % от целевого уровня
// и усредняем. 100 баллов = цель по каждому упражнению. Цели можно подкрутить здесь.
export const TARGETS = { sch_f: 40, sch_r: 30, dob: 20, mem: 24 };
export const pct = (ex, score) => Math.round((score / TARGETS[ex]) * 100);

// По дням: берём лучший результат дня; если упражнение в этот день не делали, остаётся его последнее известное значение.
export function overallSeries(results) {
  const per = Object.fromEntries(EXS.map((ex) => [ex, new Map(dayBest(results, ex).map((d) => [d.day, d.y]))]));
  const days = [...new Set(EXS.flatMap((ex) => [...per[ex].keys()]))].sort();
  const last = {};
  return days.map((day) => {
    let done = 0;
    for (const ex of EXS) if (per[ex].has(day)) { last[ex] = per[ex].get(day); done++; }
    const vals = EXS.filter((ex) => last[ex] !== undefined).map((ex) => pct(ex, last[ex]));
    return { day, y: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), n: 1, note: `упражнений в этот день: ${done} из 4` };
  });
}

// вклад каждого упражнения: последнее известное лучшее за день
export function overallShare(results) {
  return EXS.map((ex) => {
    const d = dayBest(results, ex);
    const lastDay = d[d.length - 1];
    return { ex, score: lastDay ? lastDay.y : null, pct: lastDay ? pct(ex, lastDay.y) : 0 };
  });
}

export function seriesAvg(series, fromAgo, toAgo) {
  const today = dayStr();
  const v = series.filter((p) => { const ago = diffDays(today, p.day); return ago >= fromAgo && ago < toAgo; });
  return v.length ? v.reduce((a, b) => a + b.y, 0) / v.length : null;
}
