// /Glow planner Worker: the request logic, kept free of Cloudflare-only
// imports so it can be tested in Node. index.js wires it to the runtime.
//
// Privacy: message text is never logged or stored. IPs are only kept as a
// salted, per-day hash inside the daily counters, which are purged after 2 days.

import { systemPrompt, responseSchema, catalogIds } from './prompt.js';

const enc = new TextEncoder();
const MAX_USER_CHARS = 1000;
const MAX_MODEL_CHARS = 2500;
const MAX_TURNS = 16;
const SESSION_HOURS = 6;

export function today(now) { return new Date(now).toISOString().slice(0, 10); }

function b64url(bytes) {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export async function makeSession(env, now) {
  const sid = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const body = b64url(enc.encode(JSON.stringify({ sid, exp: now + SESSION_HOURS * 3600e3 })));
  return `${body}.${b64url(await hmac(env.SESSION_SECRET, body))}`;
}

export async function readSession(env, token, now) {
  if (typeof token !== 'string' || token.length > 400) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  let ok = false;
  try { ok = sameBytes(fromB64url(sig), await hmac(env.SESSION_SECRET, body)); } catch { return null; }
  if (!ok) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    return p.exp > now ? p : null;
  } catch { return null; }
}

export async function ipKey(env, ip, day) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`${env.IP_SALT}|${day}|${ip || 'none'}`)));
  return b64url(d.slice(0, 12));
}

function limits(env) {
  const n = (v, d) => { const x = parseInt(v, 10); return Number.isFinite(x) && x > 0 ? x : d; };
  return {
    perSession: n(env.LIMIT_PER_SESSION, 25),
    perIp: n(env.LIMIT_PER_IP, 60),
    globalMessages: n(env.LIMIT_GLOBAL_MESSAGES, 1500),
    globalTokens: n(env.LIMIT_GLOBAL_TOKENS, 3000000)
  };
}

function corsHeaders(env, origin) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const h = { 'Vary': 'Origin' };
  if (origin && allowed.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return { h, ok: !!h['Access-Control-Allow-Origin'] };
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors }
  });
}

// Clean the visitor's history: alternating turns, trimmed, ending on the user.
export function cleanTurns(messages) {
  if (!Array.isArray(messages)) return null;
  const out = [];
  for (const m of messages.slice(-MAX_TURNS)) {
    if (!m || typeof m.text !== 'string') continue;
    const role = m.role === 'model' ? 'model' : 'user';
    const text = m.text.trim().slice(0, role === 'user' ? MAX_USER_CHARS : MAX_MODEL_CHARS);
    if (!text) continue;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].parts[0].text += '\n' + text;
    else out.push({ role, parts: [{ text }] });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  if (!out.length || out[out.length - 1].role !== 'user') return null;
  return out;
}

// Keep only what the page may render: known catalog ids, sane sizes.
export function cleanAnswer(raw, catalog) {
  const ids = new Set(catalogIds(catalog));
  const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const list = (v, n, len) => (Array.isArray(v) ? v.map(x => str(x, len)).filter(Boolean).slice(0, n) : []);
  const a = { reply: str(raw?.reply, 2500), offTopic: raw?.offTopic === true, plan: null, followUps: list(raw?.followUps, 3, 80) };
  if (!a.reply) a.reply = 'Sorry, I lost my train of thought. Could you say that again?';
  const p = raw?.plan;
  if (!a.offTopic && p && typeof p === 'object') {
    const items = (Array.isArray(p.items) ? p.items : [])
      .filter(i => i && ids.has(i.id))
      .map(i => ({ id: i.id, qty: Math.min(20, Math.max(1, parseInt(i.qty, 10) || 1)), why: str(i.why, 200) }))
      .slice(0, 12);
    if (items.length) {
      a.plan = { title: str(p.title, 80) || 'Your setup', items, steps: list(p.steps, 10, 240), zones: list(p.zones, 8, 120), budget: str(p.budget, 120) };
    }
  }
  return a;
}

async function askModel(env, deps, catalog, contents) {
  const generationConfig = {
    responseMimeType: 'application/json',
    responseSchema: responseSchema(catalog),
    maxOutputTokens: 1500
  };
  if (env.THINKING_LEVEL) generationConfig.thinkingConfig = { thinkingLevel: env.THINKING_LEVEL };
  const r = await deps.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.MODEL)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt(catalog) }] }, contents, generationConfig })
  });
  if (!r.ok) return { error: r.status };
  const data = await r.json();
  const tokens = data?.usageMetadata?.totalTokenCount || 0;
  const text = (data?.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* handled below */ }
  return { parsed, tokens };
}

async function verifyTurnstile(env, deps, token, ip) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const r = await deps.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  if (!r.ok) return false;
  const d = await r.json();
  return d.success === true;
}

export async function handle(request, env, deps) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const { h: cors, ok: originOk } = corsHeaders(env, origin);
  const now = deps.now();
  const day = today(now);

  if (request.method === 'OPTIONS') return new Response(null, { status: originOk ? 204 : 403, headers: cors });
  if (!originOk) return json({ error: 'origin' }, 403, cors);

  if (url.pathname === '/status' && request.method === 'GET') {
    return json(await deps.limiter.status({ day, limits: limits(env) }), 200, cors);
  }

  if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
  const len = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (len > 64000) return json({ error: 'too_big' }, 413, cors);
  let body;
  try { body = JSON.parse((await request.text()).slice(0, 64000)); } catch { return json({ error: 'bad_json' }, 400, cors); }
  const ip = request.headers.get('CF-Connecting-IP') || '';

  if (url.pathname === '/session') {
    if (!(await verifyTurnstile(env, deps, body?.turnstile, ip))) return json({ error: 'check_failed' }, 403, cors);
    return json({ session: await makeSession(env, now) }, 200, cors);
  }

  if (url.pathname === '/chat') {
    const session = await readSession(env, body?.session, now);
    if (!session) return json({ error: 'session' }, 401, cors);
    const contents = cleanTurns(body?.messages);
    if (!contents) return json({ error: 'bad_messages' }, 400, cors);

    const lim = limits(env);
    const gate = await deps.limiter.take({ day, ipKey: await ipKey(env, ip, day), sid: session.sid, limits: lim });
    if (!gate.ok) return json({ error: 'limit', scope: gate.reason }, 429, cors);

    const catalog = deps.catalog;
    let res = await askModel(env, deps, catalog, contents);
    if (res.error === 429 || res.error === 503) {
      await new Promise(r => setTimeout(r, deps.retryDelay ?? 1500));
      res = await askModel(env, deps, catalog, contents);
    }
    if (res.error) return json({ error: 'model', status: res.error }, 502, cors);
    if (res.tokens) await deps.limiter.addTokens({ day, tokens: res.tokens });
    if (!res.parsed) return json({ error: 'model_format' }, 502, cors);
    return json({ ...cleanAnswer(res.parsed, catalog), remaining: gate.remaining }, 200, cors);
  }

  return json({ error: 'not_found' }, 404, cors);
}
