#!/usr/bin/env node
// Checks /Glow share files sent to community@slashglow.com before anything is opened in the app or put on the site.
// It never runs anything from the file. It parses the JSON, then passes every item through the app's own import
// rules (normalizePattern / normPedals / normMovie from ../glow-lights), so only fields the app knows survive,
// with colors, numbers and lengths checked. Names keep letters, numbers and basic punctuation only.
// Writes a cleaned copy to ./checked/<name>.json and prints a report. The cleaned copy is what goes on the site.
// Usage: node scripts/check-share.mjs path/to/file.json [more files…]   (app repo expected at ../glow-lights)
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { basename, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const APP = process.env.GLOW_APP || join(here, '..', '..', 'glow-lights', 'app', 'src', 'main', 'assets', 'js');
const MAX_BYTES = 300_000, MAX_ITEMS = 300;
const PLACES = ['car', 'home', 'entertainment', 'holiday', 'cabinets', 'display', 'mancave', 'storefront', 'restaurant'];

// The app's code, in a sandbox with no network, files or DOM (any page access just returns nothing)
const inert = new Proxy(function(){}, { get: (t, k) => k === Symbol.toPrimitive ? () => '' : inert, apply: () => inert, construct: () => inert });
const ctx = vm.createContext({ console: { log(){}, warn(){}, error(){} }, document: inert, navigator: { userAgent: 'node' }, location: { search: '', hash: '' },
  localStorage: { getItem: () => null, setItem(){}, removeItem(){} }, setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
  requestAnimationFrame: () => 0, addEventListener(){}, removeEventListener(){}, matchMedia: () => ({ matches: false, addEventListener(){} }), performance: { now: () => 0 },
  Intl, Math, JSON, Date, Array, Object, String, Number, Boolean, RegExp, Map, Set, Promise, Symbol, Error, TypeError, parseInt, parseFloat, isFinite, isNaN, Uint8Array });
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
for (const k of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'Image', 'Audio', 'AudioContext', 'BroadcastChannel', 'TextEncoder', 'TextDecoder', 'Blob', 'URL', 'fetch', 'atob', 'btoa', 'crypto', 'speechSynthesis', 'Notification', 'CustomEvent', 'Event', 'getComputedStyle', 'screen', 'history', 'innerWidth', 'innerHeight', 'scrollTo', 'scrollBy']) ctx[k] = inert;
for (const f of ['core.js', 'bluetooth.js', 'engine.js', 'music.js', 'assist.js']) {
  try { vm.runInContext(readFileSync(join(APP, f), 'utf8').replace(/^'use strict';?/m, ''), ctx, { filename: f, timeout: 5000 }); }
  catch (e) { if (process.env.DEBUG) console.error(f, e.message); }
}
const need = ['normalizePattern', 'normPedals', 'normMovie'];
const fns = Object.fromEntries(need.map(n => [n, vm.runInContext(`typeof ${n} === 'function' ? ${n} : null`, ctx)]));
for (const n of need) if (!fns[n]) { console.error(`Couldn't load the app's ${n} from ${APP}. Is the app repo next to this one?`); process.exit(2); }
const PEDALS = vm.runInContext('PEDAL_ORDER', ctx);

const cleanText = (s, max) => String(s ?? '').normalize('NFKC').replace(/[^\p{L}\p{N} .,'’&()+:!?#\/-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max);
function cleanItem(it) {
  if (!it || typeof it !== 'object' || !it.item || typeof it.item !== 'object') return { error: 'no item' };
  const kind = it.kind, raw = it.item;
  if (kind === 'look') {
    const p = JSON.parse(JSON.stringify(fns.normalizePattern({ ...raw, id: 'u-check' })));
    delete p.id; delete p.albumAuto; delete p.albumOf; p.name = cleanText(p.name, 40) || 'Shared look';
    if (raw.rigData && typeof raw.rigData === 'object') p.rigData = { name: cleanText(raw.rigData.name, 30) || 'Shared rig', pedals: JSON.parse(JSON.stringify(fns.normPedals(Object.fromEntries(PEDALS.map(k => [k, { ...(raw.rigData.pedals?.[k] && typeof raw.rigData.pedals[k] === 'object' ? raw.rigData.pedals[k] : {}), on: !!raw.rigData.pedals?.[k]?.on }]))))) };
    return { kind, name: p.name, item: p };
  }
  if (kind === 'rig') {
    const pd = JSON.parse(JSON.stringify(fns.normPedals(Object.fromEntries(PEDALS.map(k => [k, { ...(raw.pedals?.[k] && typeof raw.pedals[k] === 'object' ? raw.pedals[k] : {}), on: !!raw.pedals?.[k]?.on }])))));
    const name = cleanText(raw.name || it.name, 30) || 'Shared rig';
    return { kind, name, item: { name, pedals: pd } };
  }
  if (kind === 'movie') {
    const m = fns.normMovie({ ...raw, id: 'mvcheck', starter: false }); if (!m) return { error: 'movie look is incomplete' };
    const c = JSON.parse(JSON.stringify(m)); delete c.id; delete c.starter; c.name = cleanText(c.name, 40) || 'Shared movie look';
    return { kind, name: c.name, item: c };
  }
  return { error: `unknown kind "${cleanText(kind, 20)}"` };
}

let bad = 0;
mkdirSync('checked', { recursive: true });
for (const path of process.argv.slice(2)) {
  const report = [`\n${basename(path)}`];
  try {
    const size = statSync(path).size; if (size > MAX_BYTES) throw new Error(`too big (${size} bytes; share files are a few KB)`);
    const text = readFileSync(path, 'utf8'); if (/^\s*[^{\s]/.test(text)) throw new Error('not a JSON object (could be another kind of file renamed .json)');
    const f = JSON.parse(text); if (!f || typeof f !== 'object' || !f.glowShare) throw new Error('not a /Glow share file');
    const list = f.glowShare >= 2 && Array.isArray(f.items) ? f.items : [f];
    if (list.length > MAX_ITEMS) throw new Error(`${list.length} items (max ${MAX_ITEMS})`);
    const items = [], skipped = [];
    for (const it of list) { const c = cleanItem(it); c.error ? skipped.push(c.error) : items.push({ ...c, pro: Array.isArray(it.pro) ? it.pro.map(x => cleanText(x, 30)).filter(Boolean).slice(0, 4) : [] }); }
    if (!items.length) throw new Error('no usable items' + (skipped.length ? `: ${skipped.join(', ')}` : ''));
    const place = PLACES.includes(f.place) ? f.place : null;
    const out = { glowShare: 2, made: /^\d{4}-\d{2}-\d{2}$/.test(f.made) ? f.made : new Date().toISOString().slice(0, 10), ...(place ? { place } : {}), items };
    const outName = basename(path).replace(/[^A-Za-z0-9._-]/g, '_').replace(/\.json$/i, '') + '.json';
    writeFileSync(join('checked', outName), JSON.stringify(out, null, 1));
    report.push(`  OK: ${items.length} item(s)${place ? ` · place: ${place}` : ' · no place tag'} → checked/${outName}`);
    for (const it of items) report.push(`   - ${it.kind}: ${it.name}${it.pro.length ? `  [Pro: ${it.pro.join(', ')}]` : ''}`);
    if (skipped.length) report.push(`  Skipped ${skipped.length}: ${skipped.join(', ')}`);
    const dropped = JSON.stringify(list).length - JSON.stringify(items.map(i => ({ kind: i.kind, item: i.item }))).length;
    if (/[<>]|script|onerror|javascript:/i.test(JSON.stringify(list.map(i => [i && i.name, i && i.item && i.item.name])))) report.push('  Warning: a name had code-like text (<, >, script). It was stripped; treat the sender with care.');
    if (dropped > 400) report.push(`  Note: ${dropped} characters of unknown or invalid content were dropped. Worth a look at who sent it.`);
  } catch (e) { bad++; report.push(`  REJECTED: ${e.message}`); }
  console.log(report.join('\n'));
}
process.exit(bad ? 1 : 0);
