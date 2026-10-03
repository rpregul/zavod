import { CLOUD } from './config.js';
import { dayStr, uid } from './util.js';

const LS = {
  get(k, d = null) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
  },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export const cloudOn = () => !!(CLOUD.url && CLOUD.key);
export const normName = (n) => n.trim().replace(/\s+/g, ' ').toLowerCase().replace(/ё/g, 'е');

async function sha256(str) {
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // запасной вариант для небезопасного контекста (file://): два прогона cyrb53 → 64 hex-символа
  const cyrb = (s, seed) => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  };
  return [1, 2, 3, 4].map((i) => cyrb(str, i)).join('');
}

async function rpc(fn, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${CLOUD.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: CLOUD.key, Authorization: `Bearer ${CLOUD.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

const DEFAULT_PREFS = { sound: false, haptics: true, dot: true };
const listeners = new Set();

export const store = {
  session: LS.get('nz.session'),
  results: [],
  prefs: { ...DEFAULT_PREFS, ...(LS.get('nz.prefs') || {}) },
  status: 'idle', // idle | syncing | ok | offline | authfail

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit() { listeners.forEach((f) => f()); },

  load() {
    this.results = this.session ? LS.get(`nz.res.${this.session.key}`, []) : [];
  },
  persist() {
    if (this.session) LS.set(`nz.res.${this.session.key}`, this.results);
  },
  setPref(k, v) {
    this.prefs[k] = v;
    LS.set('nz.prefs', this.prefs);
    this.emit();
  },

  // status: ok | created | no_user | bad_pin | locked | offline | invalid
  async login(name, pin, { create = false } = {}) {
    const key = normName(name);
    const cleanName = name.trim().replace(/\s+/g, ' ');
    if (!key || key.length > 40) return { status: 'invalid' };
    const hash = await sha256(`${key}:${pin}:nz1`);
    const users = LS.get('nz.users', {});
    let status;
    let displayName = users[key]?.name || cleanName;

    if (cloudOn()) {
      try {
        const r = await rpc('nz_login', { p_key: key, p_name: cleanName, p_hash: hash, p_create: create });
        status = r.status;
        if (r.name) displayName = r.name;
      } catch {
        // нет связи: пускаем только тех, кого этот телефон уже знает
        if (users[key]) status = users[key].hash === hash ? 'ok' : 'bad_pin';
        else status = 'offline';
      }
    } else if (users[key]) {
      status = users[key].hash === hash ? 'ok' : 'bad_pin';
    } else if (create) {
      status = 'created';
    } else {
      status = 'no_user';
    }

    if (status === 'ok' || status === 'created') {
      users[key] = { name: displayName, hash };
      LS.set('nz.users', users);
      this.session = { key, name: displayName, hash };
      LS.set('nz.session', this.session);
      this.load();
      this.emit();
      this.sync();
    }
    return { status };
  },

  logout() {
    this.session = null;
    this.results = [];
    this.status = 'idle';
    LS.del('nz.session');
    this.emit();
  },

  add(ex, score, meta = {}) {
    const rec = { id: uid(), ex, score, day: dayStr(), ts: Date.now(), meta, s: 0 };
    this.results.push(rec);
    this.persist();
    this.emit();
    this.sync();
    return rec;
  },

  async sync() {
    if (!cloudOn() || !this.session || this._syncing) return;
    this._syncing = true;
    const { key, hash } = this.session;
    try {
      this.status = 'syncing';
      this.emit();
      // профиль мог быть создан до подключения облака: заводим его там тем же именем и PIN
      const acc = await rpc('nz_login', { p_key: key, p_name: this.session.name, p_hash: hash, p_create: true });
      if (acc.status !== 'ok' && acc.status !== 'created') { this.status = 'authfail'; return; }
      const unsynced = this.results.filter((r) => !r.s);
      for (let i = 0; i < unsynced.length; i += 200) {
        const chunk = unsynced.slice(i, i + 200);
        const r = await rpc('nz_push', {
          p_key: key, p_hash: hash,
          p_rows: chunk.map(({ s, ...row }) => row),
        });
        if (r.status !== 'ok') { this.status = 'authfail'; return; }
        chunk.forEach((x) => { x.s = 1; });
      }
      const pulled = await rpc('nz_pull', { p_key: key, p_hash: hash });
      if (pulled.status !== 'ok') { this.status = 'authfail'; return; }
      const have = new Set(this.results.map((r) => r.id));
      for (const row of pulled.rows || []) {
        if (!have.has(row.id)) this.results.push({ ...row, s: 1 });
      }
      this.results.sort((a, b) => a.ts - b.ts);
      this.persist();
      this.status = 'ok';
    } catch {
      this.status = 'offline';
    } finally {
      this._syncing = false;
      this.emit();
    }
  },

  exportJson() {
    return JSON.stringify({ name: this.session?.name, exported: new Date().toISOString(), results: this.results.map(({ s, ...r }) => r) }, null, 2);
  },
};
