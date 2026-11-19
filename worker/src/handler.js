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
    globalTokens: n(env.LIMIT_GLOBAL_TOKENS, 3000000),
    aiPerCode: n(env.LIMIT_AI_PER_CODE, 150),
    aiGlobalMessages: n(env.LIMIT_AI_GLOBAL_MESSAGES, 3000),
    aiGlobalTokens: n(env.LIMIT_AI_GLOBAL_TOKENS, 6000000)
  };
}

function corsHeaders(env, origin) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const h = { 'Vary': 'Origin' };
  if (origin && allowed.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type, X-Glow-Code';
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
  const a = { reply: str(raw?.reply, 2500), offTopic: raw?.offTopic === true, plan: null, quick: list(raw?.quick, 4, 40), followUps: list(raw?.followUps, 3, 80) };
  if (!a.reply) a.reply = 'Sorry, I lost my train of thought. Could you say that again?';
  const p = raw?.plan;
  if (!a.offTopic && p && typeof p === 'object') {
    const items = (Array.isArray(p.items) ? p.items : [])
      .filter(i => i && ids.has(i.id))
      .map(i => ({ id: i.id, qty: Math.min(20, Math.max(1, parseInt(i.qty, 10) || 1)), why: str(i.why, 200), when: i.when === 'later' ? 'later' : 'now' }))
      .slice(0, 12);
    // steps: {do, check}; older plain-text steps still count
    const steps = (Array.isArray(p.steps) ? p.steps : []).map(x => typeof x === 'string' ? { do: str(x, 240), check: '' } : { do: str(x?.do, 240), check: str(x?.check, 160) })
      .filter(x => x.do).slice(0, 12);
    if (items.length) {
      a.plan = { title: str(p.title, 80) || 'Your setup', items, need: list(p.need, 8, 80), mock: str(p.mock, 240), steps, zones: list(p.zones, 8, 40), budget: str(p.budget, 120) };
    }
  }
  if (a.offTopic) a.quick = [];
  return a;
}

async function askModel(env, deps, catalog, contents, space) {
  const generationConfig = {
    responseMimeType: 'application/json',
    responseSchema: responseSchema(catalog),
    maxOutputTokens: 1800
  };
  if (env.THINKING_LEVEL) generationConfig.thinkingConfig = { thinkingLevel: env.THINKING_LEVEL };
  const r = await deps.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.MODEL)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt(catalog, space) }] }, contents, generationConfig })
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

// ---------------------------------------------------------------- Glow AI
// The app's built-in assistant for beta testers: the app sends a Gemini-style request with an invite code
// (stored on the phone like an API key); this Worker adds the real key, so no key ever ships in the app.
// Requests come from the Android app (no Origin header), so the invite code is the gate, not the origin.
// Nothing is logged or stored; invite codes only appear in the counters as a salted per-day hash.
const AI_MAX_BYTES = 3_000_000;         // room for one screenshot or space photo
const AI_MAX_TURNS = 40;
const AI_MAX_TEXT = 60000;              // per part: help questions carry a setup summary and a log
const AI_MAX_OUTPUT = 4000;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function aiCodes(env) {
  return String(env.GLOW_AI_CODES || '').split(/[\s,]+/).map(s => s.trim()).filter(c => c.length >= 6);
}
async function codeOk(env, code) {
  if (typeof code !== 'string' || code.length < 6 || code.length > 100) return false;
  const want = await hmac(env.IP_SALT || 'glow', code.trim());
  let ok = false;
  for (const c of aiCodes(env)) if (sameBytes(await hmac(env.IP_SALT || 'glow', c), want)) ok = true;
  return ok;
}
export async function codeKey(env, code, day) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`${env.IP_SALT}|ai|${day}|${code.trim()}`)));
  return b64url(d.slice(0, 12));
}

// Keep only text and images from a Gemini-style request; no tools, no files, no URLs.
export function cleanAiRequest(body) {
  if (!body || typeof body !== 'object') return null;
  const parts = list => (Array.isArray(list) ? list : []).map(p => {
    if (typeof p?.text === 'string') return p.text ? { text: p.text.slice(0, AI_MAX_TEXT) } : null;
    const img = p?.inline_data || p?.inlineData;
    if (img && IMAGE_TYPES.has(img.mime_type || img.mimeType) && typeof img.data === 'string' && /^[A-Za-z0-9+/=]+$/.test(img.data.slice(0, 200)))
      return { inline_data: { mime_type: img.mime_type || img.mimeType, data: img.data } };
    return null;
  }).filter(Boolean).slice(0, 4);
  const contents = (Array.isArray(body.contents) ? body.contents : []).slice(-AI_MAX_TURNS)
    .map(c => ({ role: c?.role === 'model' ? 'model' : 'user', parts: parts(c?.parts) })).filter(c => c.parts.length);
  if (!contents.length || contents[contents.length - 1].role !== 'user') return null;
  const sys = parts(body.systemInstruction?.parts).filter(p => p.text);
  const asked = parseInt(body.generationConfig?.maxOutputTokens, 10);
  const generationConfig = { maxOutputTokens: Math.min(AI_MAX_OUTPUT, asked > 0 ? asked : 1500) };
  if (body.generationConfig?.responseMimeType === 'application/json') generationConfig.responseMimeType = 'application/json';
  return { contents, systemInstruction: sys.length ? { parts: sys } : undefined, generationConfig };
}

const aiErr = (status, code, message, cors) => json({ error: { code, message } }, status, cors);

async function handleAi(request, env, deps, cors, day) {
  if (request.method !== 'POST') return aiErr(405, 'method', 'Use POST.', cors);
  if (!env.GLOW_AI_KEY) return aiErr(503, 'off', 'Glow AI isn’t switched on yet.', cors);
  const code = request.headers.get('X-Glow-Code') || '';
  if (!(await codeOk(env, code))) return aiErr(401, 'code', 'That Glow AI invite code isn’t valid. Check it in Settings → AI assistant.', cors);
  const len = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (len > AI_MAX_BYTES) return aiErr(413, 'too_big', 'That request is too large (try a smaller screenshot).', cors);
  const raw = await request.text();
  if (raw.length > AI_MAX_BYTES) return aiErr(413, 'too_big', 'That request is too large (try a smaller screenshot).', cors);
  let req;
  try { req = cleanAiRequest(JSON.parse(raw)); } catch { req = null; }
  if (!req) return aiErr(400, 'bad_request', 'Glow AI couldn’t read that request.', cors);

  const gate = await deps.limiter.takeAi({ day, codeKey: await codeKey(env, code, day), limits: limits(env) });
  if (!gate.ok) return aiErr(403, 'limit', gate.reason === 'code'
    ? 'You’ve used today’s Glow AI questions. They reset at 7 pm Eastern (midnight UTC).'
    : 'Glow AI is resting for the day. It’s back at 7 pm Eastern (midnight UTC).', cors);

  const model = env.AI_MODEL || env.MODEL;
  if (env.AI_THINKING_LEVEL) req.generationConfig.thinkingConfig = { thinkingLevel: env.AI_THINKING_LEVEL };
  const ask = () => deps.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GLOW_AI_KEY }, body: JSON.stringify(req)
  });
  let r = await ask();
  if (r.status === 429 || r.status === 503) { await new Promise(res => setTimeout(res, deps.retryDelay ?? 1500)); r = await ask(); }
  if (!r.ok) return aiErr(502, 'model', `Glow AI’s model is busy (${r.status}). Try again in a minute.`, cors);
  const data = await r.json();
  const tokens = data?.usageMetadata?.totalTokenCount || 0;
  if (tokens) await deps.limiter.addAiTokens({ day, tokens });
  // Only the answer text goes back (same shape as Gemini's, so the app reads it the same way).
  const text = (data?.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
  return json({ candidates: [{ content: { parts: [{ text }] } }], remaining: gate.remaining }, 200, cors);
}

export async function handle(request, env, deps) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const { h: cors, ok: originOk } = corsHeaders(env, origin);
  const now = deps.now();
  const day = today(now);

  if (request.method === 'OPTIONS') return new Response(null, { status: originOk ? 204 : 403, headers: cors });
  // Glow AI: the app has no Origin; a browser must still come from an allowed origin
  if (url.pathname === '/ai' && (!origin || originOk)) return handleAi(request, env, deps, cors, day);
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
    let res = await askModel(env, deps, catalog, contents, body?.space);
    if (res.error === 429 || res.error === 503) {
      await new Promise(r => setTimeout(r, deps.retryDelay ?? 1500));
      res = await askModel(env, deps, catalog, contents, body?.space);
    }
    if (res.error) return json({ error: 'model', status: res.error }, 502, cors);
    if (res.tokens) await deps.limiter.addTokens({ day, tokens: res.tokens });
    if (!res.parsed) return json({ error: 'model_format' }, 502, cors);
    return json({ ...cleanAnswer(res.parsed, catalog), remaining: gate.remaining }, 200, cors);
  }

  return json({ error: 'not_found' }, 404, cors);
}
