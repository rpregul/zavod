import { CLOUD, BILLING } from './config.js?v=1.1.2';
import { billingRequest } from './billing-api.js?v=1.1.2';
import { dayStr, uid } from './util.js?v=1.1.2';

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
  access: null,

  async startGuest() {
    let entry = LS.get('nz.guest');
    if (!entry) {
      entry = { key: 'g_' + crypto.randomUUID().replaceAll('-', ''), secret: crypto.randomUUID() };
      LS.set('nz.guest', entry);
    }
    return this.login(entry.key, entry.secret, { create: true });
  },
  async claimGuest(name, pin) {
    name = name.trim().replace(/\s+/g, ' ');
    const key = normName(name);
    const status = await rpc('nz_claim_guest', { p_token: this.session.token, p_name: name, p_key: key, p_hash: await sha256(key + ':' + pin + ':nz1') });
    if (status === 'ok') {
      const personal = LS.get('nz.personal.' + this.session.key);
      if (personal) LS.set('nz.personal.' + key, personal);
      this.session = { key, name, token: this.session.token };
      LS.set('nz.session', this.session);
      this.persist();
      LS.del('nz.guest');
      this.emit();
    }
    return status;
  },
  async refreshAccess() {
    if (!BILLING.enabled || !this.session) return null;
    this.access = await this.billing('status');
    this.emit();
    return this.access;
  },

  async billing(action, data = {}) {
    if (!this.session) throw new Error('unauthorized');
    if (!this.session.token) {
      if (!this.session.hash) throw new Error('unauthorized');
      const result = await billingRequest('login', { name: this.session.name, hash: this.session.hash });
      if (!result.token) throw new Error('unauthorized');
      this.session.token = result.token;
      LS.set('nz.session', this.session);
    }
    try {
      return await billingRequest(action, data, this.session.token);
    } catch (error) {
      if (error.status === 401) {
        delete this.session.token;
        LS.set('nz.session', this.session);
      }
      throw error;
    }
  },

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
    if (BILLING.enabled) {
      try {
        const result = await billingRequest('login', { name: cleanName, hash, create });
        if (result.token) {
          this.session = { key, name: result.name || cleanName, token: result.token, ...(/^g_[a-f0-9]{32}$/.test(key) ? { hash } : {}) };
          LS.set('nz.session', this.session);
          this.access = null;
          this.load();
          this.emit();
          this.sync();
        }
        return result;
      } catch { return { status: 'offline' }; }
    }
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
    if (BILLING.enabled && this.session?.token) billingRequest('logout', {}, this.session.token).catch(() => {});
    this.session = null;
    this.access = null;
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
    if (BILLING.enabled) {
      try {
        this.status = 'syncing';
        this.emit();
        // Restore saved history before attempting any local uploads. A rejected
        // pending attempt must never hide results already stored on the server.
        const errors = [];
        try {
          const pulled = await this.billing('pull');
          if (!Array.isArray(pulled.rows)) throw new Error('invalid_history');
          const serverIds = new Set(pulled.rows.map(row => row.id));
          this.results = this.results.filter(row => !row.s || serverIds.has(row.id));
          const byId = new Map(this.results.map(r => [r.id, r]));
          for (const row of pulled.rows || []) {
            const mine = byId.get(row.id);
            if (!mine) { const saved = { ...row, s: 1 }; this.results.push(saved); byId.set(row.id, saved); }
            else Object.assign(mine, row, { s: 1 });
          }
          this.results.sort((a, b) => a.ts - b.ts);
          this.persist();
          this.emit();
        } catch (error) { errors.push(error); }
        try { this.access = await this.billing('status'); this.emit(); }
        catch (error) { errors.push(error); }
        if (!errors.some(error => error.status === 401 || error.message === 'unauthorized')) {
          let trialChanged = false;
          for (const row of this.results.filter(r => !r.s && r.meta?.trial_id)) {
            try {
              await this.billing('trial-result', { trial_id: row.meta.trial_id, row });
              row.s = 1;
              trialChanged = true;
            } catch (error) { errors.push(error); break; }
          }
          if (this.access?.active) {
            const unsynced = this.results.filter(r => !r.s);
            for (let i = 0; i < unsynced.length; i += 200) {
              const chunk = unsynced.slice(i, i + 200);
              try {
                await this.billing('push', { rows: chunk.map(({ s, ...row }) => row) });
                chunk.forEach(r => { r.s = 1; });
              } catch (error) { errors.push(error); break; }
            }
          }
          if (trialChanged) {
            try { this.access = await this.billing('status'); }
            catch (error) { errors.push(error); }
          }
        }
        this.persist();
        this.status = errors.some(error => error.status === 401 || error.message === 'unauthorized')
          ? 'authfail' : errors.length ? 'offline' : 'ok';
      } catch (error) { this.status = error.status === 401 || error.message === 'unauthorized' ? 'authfail' : 'offline'; }
      finally { this._syncing = false; this.emit(); }
      return;
    }
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
      // облако главнее: новые записи добавляем, а у уже синхронизированных подтягиваем правки (например, перенос даты)
      const byId = new Map(this.results.map((r) => [r.id, r]));
      for (const row of pulled.rows || []) {
        const mine = byId.get(row.id);
        if (!mine) this.results.push({ ...row, s: 1 });
        else if (mine.s) Object.assign(mine, { ex: row.ex, score: row.score, day: row.day, ts: row.ts, meta: row.meta });
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


