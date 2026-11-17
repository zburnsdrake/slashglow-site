// Daily limits: per visitor (browser session), per IP (hashed), and global
// (messages and tokens across everyone). Pure logic over a tiny store so it
// can be tested in Node; the Durable Object in index.js supplies the store.
//
// store: { get(key) -> number, set(key, day, n), purgeBefore(day) }

export class LimiterCore {
  constructor(store) { this.store = store; }

  keys(day, ipKey, sid) {
    return {
      gMsgs: `g:msgs:${day}`,
      gTok: `g:tok:${day}`,
      ip: `ip:${day}:${ipKey}`,
      sid: `sid:${day}:${sid}`
    };
  }

  take({ day, ipKey, sid, limits }) {
    const k = this.keys(day, ipKey, sid);
    const gMsgs = this.store.get(k.gMsgs), gTok = this.store.get(k.gTok);
    const ip = this.store.get(k.ip), s = this.store.get(k.sid);
    if (gMsgs >= limits.globalMessages || gTok >= limits.globalTokens) return { ok: false, reason: 'global' };
    if (ip >= limits.perIp) return { ok: false, reason: 'ip' };
    if (s >= limits.perSession) return { ok: false, reason: 'session' };
    this.store.set(k.gMsgs, day, gMsgs + 1);
    this.store.set(k.ip, day, ip + 1);
    this.store.set(k.sid, day, s + 1);
    return { ok: true, remaining: Math.min(limits.perSession - s - 1, limits.perIp - ip - 1) };
  }

  addTokens({ day, tokens }) {
    const key = `g:tok:${day}`;
    this.store.set(key, day, this.store.get(key) + Math.max(0, tokens | 0));
  }

  status({ day, limits }) {
    const k = this.keys(day, '', '');
    return { open: this.store.get(k.gMsgs) < limits.globalMessages && this.store.get(k.gTok) < limits.globalTokens };
  }

  purge(day) { this.store.purgeBefore(day); }
}

export function memoryStore() {
  const m = new Map();
  return {
    get: k => (m.get(k)?.n ?? 0),
    set: (k, day, n) => m.set(k, { day, n }),
    purgeBefore: day => { for (const [k, v] of m) if (v.day < day) m.delete(k); },
    size: () => m.size,
    keys: () => [...m.keys()]
  };
}
