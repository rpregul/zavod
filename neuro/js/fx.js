import { store } from './store.js';
import { el } from './util.js';

// ---------- вибрация и звук ----------
export function haptic(pattern = 12) {
  if (!store.prefs.haptics) return;
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}

let actx;
function tone(freq, start, dur, type = 'sine', gain = 0.06) {
  const t0 = actx.currentTime + start;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(actx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export function sfx(kind) {
  if (!store.prefs.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    if (kind === 'tap') tone(660, 0, 0.07, 'sine', 0.05);
    else if (kind === 'ok') { tone(740, 0, 0.09); tone(988, 0.07, 0.12); }
    else if (kind === 'bad') tone(170, 0, 0.18, 'triangle', 0.07);
    else if (kind === 'tick') tone(880, 0, 0.05, 'square', 0.025);
    else if (kind === 'go') { tone(523, 0, 0.1); tone(784, 0.1, 0.16); }
    else if (kind === 'done') { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.2)); }
  } catch { /* ignore */ }
}

// ---------- конфетти ----------
let canvas, ctx, parts = [], raf = 0;
export function initFx() {
  canvas = document.getElementById('fx');
  ctx = canvas.getContext('2d');
  const fit = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit();
  addEventListener('resize', fit);
}

const COLORS = ['#ff9a3d', '#ff5e63', '#ff4fa0', '#b24bf3', '#4f7cff', '#22c5a5', '#cbf23d', '#ffd23f'];

export function confetti({ x = innerWidth / 2, y = innerHeight * 0.35, count = 120, spread = 1 } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (4 + Math.random() * 9) * spread;
    parts.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 5,
      w: 5 + Math.random() * 7, h: 3 + Math.random() * 5,
      r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      c: COLORS[(Math.random() * COLORS.length) | 0],
      round: Math.random() < 0.3, life: 0, max: 90 + Math.random() * 60,
    });
  }
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter((p) => p.life < p.max && p.y < innerHeight + 30);
  for (const p of parts) {
    p.life++;
    p.vy += 0.32;
    p.vx *= 0.992;
    p.x += p.vx;
    p.y += p.vy;
    p.r += p.vr;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (p.max - p.life) / 25);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.r);
    ctx.fillStyle = p.c;
    if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, 7); ctx.fill(); } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }
  raf = parts.length ? requestAnimationFrame(tick) : 0;
  if (!raf) ctx.clearRect(0, 0, innerWidth, innerHeight);
}

// ---------- всплывающий текст («+1», «Рекорд!») ----------
export function floatText(x, y, text, cls = '') {
  const n = el('div', `float-text ${cls}`, text);
  n.style.left = `${x}px`;
  n.style.top = `${y}px`;
  document.body.appendChild(n);
  n.addEventListener('animationend', () => n.remove());
  setTimeout(() => n.remove(), 1400);
}

// искры вокруг точки (для правильных ответов)
export function sparkle(x, y, n = 10) {
  for (let i = 0; i < n; i++) {
    const s = el('i', 'spark');
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
    const d = 28 + Math.random() * 34;
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    s.style.setProperty('--dy', `${Math.sin(a) * d}px`);
    s.style.background = COLORS[(Math.random() * COLORS.length) | 0];
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 700);
  }
}

// ---------- тосты ----------
export function toast(html, ms = 2600) {
  const root = document.getElementById('toast-root');
  const t = el('div', 'toast glass', html);
  root.appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => {
    t.classList.remove('in');
    setTimeout(() => t.remove(), 350);
  }, ms);
}

// ---------- счётчик «набегающей» цифры ----------
export function countUp(node, to, { dur = 900, decimals = 0, from = 0, suffix = '' } = {}) {
  const t0 = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const v = from + (to - from) * ease(k);
    node.textContent = (decimals ? v.toFixed(decimals) : Math.round(v)) + suffix;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- ripple на кнопках ----------
export function initRipple() {
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest?.('.btn, .tab, .key, .chip-btn');
    if (!b) return;
    const r = b.getBoundingClientRect();
    const s = Math.max(r.width, r.height) * 1.6;
    const rip = el('span', 'ripple');
    rip.style.width = rip.style.height = `${s}px`;
    rip.style.left = `${e.clientX - r.left - s / 2}px`;
    rip.style.top = `${e.clientY - r.top - s / 2}px`;
    b.appendChild(rip);
    setTimeout(() => rip.remove(), 650);
  }, { passive: true });
}
