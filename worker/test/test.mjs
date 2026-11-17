// Plain-Node tests for the planner Worker logic: node worker/test/test.mjs
import assert from 'node:assert/strict';
import catalog from '../../catalog.json' with { type: 'json' };
import { handle, cleanTurns, cleanAnswer, readSession, makeSession } from '../src/handler.js';
import { LimiterCore, memoryStore } from '../src/limiter.js';
import { systemPrompt, responseSchema } from '../src/prompt.js';

const env = {
  GEMINI_API_KEY: 'test-key', TURNSTILE_SECRET: 'ts', SESSION_SECRET: 'sess-secret', IP_SALT: 'salt',
  MODEL: 'gemini-test', ALLOWED_ORIGINS: 'https://slashglow.com,http://localhost:8765',
  LIMIT_PER_SESSION: '3', LIMIT_PER_IP: '5', LIMIT_GLOBAL_MESSAGES: '8', LIMIT_GLOBAL_TOKENS: '100000'
};
let now = Date.parse('2026-11-17T12:00:00Z');
const store = memoryStore();
const core = new LimiterCore(store);
const limiter = { take: async a => core.take(a), addTokens: async a => core.addTokens(a), status: async a => core.status(a) };
let modelReply = { reply: 'Here is a plan.', offTopic: false, plan: { title: 'TV wall', items: [{ id: 'sp110e', qty: 1, why: 'TV' }, { id: 'made-up', qty: 2 }], steps: ['Mount'] }, followUps: ['How long?'] };
let modelStatus = 200, calls = [];
const fakeFetch = async (url, init) => {
  calls.push({ url, init });
  if (url.includes('turnstile')) {
    const ok = init.body.get('response') === 'good';
    return new Response(JSON.stringify({ success: ok }));
  }
  if (modelStatus !== 200) return new Response('busy', { status: modelStatus });
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(modelReply) }] } }], usageMetadata: { totalTokenCount: 1234 } }));
};
const deps = { limiter, catalog, fetch: fakeFetch, now: () => now, retryDelay: 1 };
const req = (path, body, { origin = 'https://slashglow.com', ip = '1.2.3.4', method = 'POST' } = {}) =>
  new Request('https://planner.example.workers.dev' + path, {
    method, headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': ip },
    body: method === 'POST' ? JSON.stringify(body) : undefined
  });
const call = async (...a) => { const r = await handle(req(...a), env, deps); return { status: r.status, body: await r.json().catch(() => null), headers: r.headers }; };

let pass = 0;
const t = async (name, fn) => { await fn(); pass++; console.log('ok -', name); };

await t('prompt lists every catalog id and the schema enum matches', () => {
  const p = systemPrompt(catalog);
  for (const i of catalog.items) assert.ok(p.includes(i.id));
  assert.deepEqual(responseSchema(catalog).properties.plan.properties.items.items.properties.id.enum, catalog.items.map(i => i.id));
});

await t('foreign origin is refused, preflight allowed for ours', async () => {
  assert.equal((await call('/chat', {}, { origin: 'https://evil.example' })).status, 403);
  const r = await handle(new Request('https://x/chat', { method: 'OPTIONS', headers: { Origin: 'https://slashglow.com' } }), env, deps);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://slashglow.com');
});

await t('session needs a passing Turnstile check', async () => {
  assert.equal((await call('/session', { turnstile: 'bad' })).status, 403);
  const r = await call('/session', { turnstile: 'good' });
  assert.equal(r.status, 200);
  assert.ok(await readSession(env, r.body.session, now));
});

await t('forged, tampered and expired sessions are refused', async () => {
  const s = await makeSession(env, now);
  assert.equal(await readSession(env, s.replace(/.$/, c => (c === 'A' ? 'B' : 'A')), now), null);
  assert.equal(await readSession({ ...env, SESSION_SECRET: 'other' }, s, now), null);
  assert.equal(await readSession(env, s, now + 7 * 3600e3), null);
  assert.equal((await call('/chat', { session: 'x.y', messages: [{ role: 'user', text: 'hi' }] })).status, 401);
});

await t('chat returns a cleaned answer, unknown parts dropped, key sent only to Google', async () => {
  const { body: { session } } = await call('/session', { turnstile: 'good' });
  calls = [];
  const r = await call('/chat', { session, messages: [{ role: 'user', text: 'Lights behind my TV' }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.plan.items.map(i => i.id), ['sp110e']);
  const g = calls.find(c => c.url.includes('generativelanguage'));
  assert.equal(g.init.headers['x-goog-api-key'], 'test-key');
  assert.ok(!g.url.includes('test-key'));
  assert.ok(!JSON.stringify(r.body).includes('test-key'));
  assert.equal(store.get('g:tok:2026-11-17'), 1234);
});

await t('per-session limit, then per-IP, then global', async () => {
  // fresh day
  now = Date.parse('2026-11-18T12:00:00Z');
  const s1 = (await call('/session', { turnstile: 'good' })).body.session;
  const msg = { messages: [{ role: 'user', text: 'desk lights' }] };
  for (let i = 0; i < 3; i++) assert.equal((await call('/chat', { session: s1, ...msg })).status, 200);
  const blocked = await call('/chat', { session: s1, ...msg });
  assert.equal(blocked.status, 429); assert.equal(blocked.body.scope, 'session');
  const s2 = (await call('/session', { turnstile: 'good' })).body.session;
  assert.equal((await call('/chat', { session: s2, ...msg })).status, 200);
  assert.equal((await call('/chat', { session: s2, ...msg })).status, 200);
  const ipBlock = await call('/chat', { session: s2, ...msg });
  assert.equal(ipBlock.status, 429); assert.equal(ipBlock.body.scope, 'ip');
  // other IPs fill the global cap of 8
  const s3 = (await call('/session', { turnstile: 'good' })).body.session;
  for (let i = 0; i < 3; i++) assert.equal((await call('/chat', { session: s3, ...msg }, { ip: '9.9.9.' + i })).status, 200);
  const g = await call('/chat', { session: (await call('/session', { turnstile: 'good' })).body.session, ...msg }, { ip: '8.8.8.8' });
  assert.equal(g.status, 429); assert.equal(g.body.scope, 'global');
  assert.equal((await call('/status', null, { method: 'GET' })).body.open, false);
});

await t('token budget closes the chat for the day', async () => {
  now = Date.parse('2026-11-19T12:00:00Z');
  core.addTokens({ day: '2026-11-19', tokens: 100000 });
  const s = (await call('/session', { turnstile: 'good' })).body.session;
  const r = await call('/chat', { session: s, messages: [{ role: 'user', text: 'hi' }] });
  assert.equal(r.status, 429); assert.equal(r.body.scope, 'global');
});

await t('raw IPs are never stored; old days purge', async () => {
  assert.ok(store.keys().length > 0);
  assert.ok(!store.keys().join(' ').includes('1.2.3.4'));
  assert.ok(!store.keys().join(' ').includes('9.9.9.'));
  core.purge('2026-11-18');
  assert.ok(store.keys().every(k => !k.includes('2026-11-17')));
});

await t('busy model is retried once, then reported', async () => {
  now = Date.parse('2026-11-20T12:00:00Z');
  const s = (await call('/session', { turnstile: 'good' })).body.session;
  modelStatus = 503; calls = [];
  const r = await call('/chat', { session: s, messages: [{ role: 'user', text: 'hi' }] });
  assert.equal(r.status, 502);
  assert.equal(calls.filter(c => c.url.includes('generativelanguage')).length, 2);
  modelStatus = 200;
});

await t('history is trimmed, merged and must end with the visitor', () => {
  assert.equal(cleanTurns([{ role: 'model', text: 'hi' }]), null);
  const c = cleanTurns([{ role: 'model', text: 'a' }, { role: 'user', text: 'x'.repeat(5000) }, { role: 'user', text: 'b' }]);
  assert.equal(c.length, 1); assert.equal(c[0].role, 'user'); assert.ok(c[0].parts[0].text.length <= 1002);
  assert.equal(cleanTurns(Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'model' : 'user', text: 't' + i })).concat([{ role: 'user', text: 'end' }])).length <= 16, true);
});

await t('off-topic answers carry no plan', () => {
  const a = cleanAnswer({ reply: 'I only help with lighting.', offTopic: true, plan: { title: 'x', items: [{ id: 'sp110e', qty: 1 }] } }, catalog);
  assert.equal(a.plan, null);
  assert.equal(cleanAnswer({}, catalog).reply.length > 0, true);
});

console.log(`\n${pass} passed`);
