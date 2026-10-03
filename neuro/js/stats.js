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
