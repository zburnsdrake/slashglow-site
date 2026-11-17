// Plans that travel: a plan packed into a link (and QR code) for the /Glow app, and a plan as plain text.
// The plan rides in the link's #fragment, which browsers never send to a server: nothing is stored anywhere.
// Format: "1" + base64url(deflate-raw(JSON)), or "0" + base64url(JSON) where compression isn't available.
// JSON: {v:1, t:title, i:[[id, qty, later?1:0]], n:[need], m:mock, s:[[do, check]], z:[zones], b:budget}
(() => {
  'use strict';
  const MAX = 1800; // characters of packed plan; keeps the QR code scannable from a screen

  const b64u = bytes => { let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = str => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); };
  async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

  function compact(plan, full) {
    const s = String;
    return {
      v: 1, t: s(plan.title || 'Your setup').slice(0, 80),
      i: (plan.items || []).map(x => [s(x.id), Math.max(1, Math.min(20, x.qty | 0 || 1)), x.when === 'later' ? 1 : 0]),
      n: (plan.need || []).map(x => s(x).slice(0, 80)),
      m: full ? s(plan.mock || '').slice(0, 240) : '',
      s: (plan.steps || []).map(x => typeof x === 'string' ? [x.slice(0, full ? 240 : 140), ''] : [s(x.do || '').slice(0, full ? 240 : 140), full ? s(x.check || '').slice(0, 160) : '']),
      z: (plan.zones || []).map(x => s(x).slice(0, 40)),
      b: s(plan.budget || '').slice(0, 120)
    };
  }

  async function pack(plan) {
    for (const full of [true, false]) {
      const bytes = new TextEncoder().encode(JSON.stringify(compact(plan, full)));
      let out;
      if (typeof CompressionStream === 'function') { try { out = '1' + b64u(await pipe(bytes, new CompressionStream('deflate-raw'))); } catch (e) { out = null; } }
      if (!out) out = '0' + b64u(bytes);
      if (out.length <= MAX) return out;
    }
    return null; // too long for a link: the person can copy it as text instead
  }

  async function unpack(str) {
    if (typeof str !== 'string' || str.length > 4000 || !/^[01][A-Za-z0-9_-]+$/.test(str)) return null;
    try {
      let bytes = unb64u(str.slice(1));
      if (str[0] === '1') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
      if (bytes.length > 20000) return null;
      const j = JSON.parse(new TextDecoder().decode(bytes));
      if (!j || j.v !== 1 || !Array.isArray(j.i)) return null;
      const s = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
      const list = (v, n, len) => Array.isArray(v) ? v.map(x => s(x, len)).filter(Boolean).slice(0, n) : [];
      return {
        title: s(j.t, 80) || 'Your setup',
        items: j.i.filter(x => Array.isArray(x) && /^[a-z0-9-]{1,40}$/.test(x[0])).slice(0, 12).map(x => ({ id: x[0], qty: Math.max(1, Math.min(20, parseInt(x[1], 10) || 1)), when: x[2] ? 'later' : 'now' })),
        need: list(j.n, 8, 80), mock: s(j.m, 240),
        steps: (Array.isArray(j.s) ? j.s : []).filter(Array.isArray).map(x => ({ do: s(x[0], 240), check: s(x[1], 160) })).filter(x => x.do).slice(0, 12),
        zones: list(j.z, 8, 40), budget: s(j.b, 120)
      };
    } catch (e) { return null; }
  }

  // The plan as plain text: recommendations and the install plan, nothing else.
  function text(plan, catalog) {
    const name = id => (catalog?.items || []).find(c => c.id === id)?.name || id;
    const status = id => { const st = (catalog?.items || []).find(c => c.id === id)?.status; return st === 'tested' ? 'tested' : st ? 'in testing' : ''; };
    const L = [plan.title || 'Your setup', ''];
    const group = (h, rows) => { if (!rows.length) return; L.push(h); rows.forEach(x => L.push(`- ${x.qty}× ${name(x.id)}${status(x.id) ? ` (${status(x.id)})` : ''}${x.why ? ': ' + x.why : ''}`)); L.push(''); };
    const later = plan.items.filter(x => x.when === 'later');
    group(later.length ? 'Order now' : 'Parts', plan.items.filter(x => x.when !== 'later'));
    group('Order later', later);
    if (plan.need?.length) { L.push('You’ll also need'); plan.need.forEach(x => L.push('- ' + x)); L.push(''); }
    if (plan.mock) { L.push('Mock it up first', plan.mock, ''); }
    if (plan.steps?.length) { L.push('Steps'); plan.steps.forEach((x, i) => { L.push(`${i + 1}. ${typeof x === 'string' ? x : x.do}`); if (x.check) L.push(`   Check: ${x.check}`); }); L.push(''); }
    if (plan.zones?.length) { L.push('Zones in /Glow: ' + plan.zones.join(', '), ''); }
    if (plan.budget) L.push('Rough budget (an estimate): ' + plan.budget, '');
    L.push('Planned with /Glow · slashglow.com/plan');
    return L.join('\n');
  }

  const link = packed => `https://slashglow.com/open#p=${packed}`;
  const intent = packed => `intent://plan?p=${packed}#Intent;scheme=glowplan;package=com.orxstrategy.glow;S.browser_fallback_url=${encodeURIComponent('https://slashglow.com/index.html#beta')};end`;

  // A QR code as an SVG element (needs assets/qr.js)
  function qrSVG(textToEncode, px) {
    const q = window.GlowQR(textToEncode, 'L'), n = q.getModuleCount(), quiet = 4, size = n + quiet * 2;
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`); svg.setAttribute('width', px); svg.setAttribute('height', px);
    svg.setAttribute('shape-rendering', 'crispEdges'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'QR code for this plan');
    const bg = document.createElementNS(NS, 'rect'); bg.setAttribute('width', size); bg.setAttribute('height', size); bg.setAttribute('fill', '#fff'); svg.appendChild(bg);
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('fill', '#000'); svg.appendChild(p);
    return svg;
  }

  window.GlowPlanLink = { pack, unpack, text, link, intent, qrSVG, MAX };
})();
