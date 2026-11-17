// Opens a plan carried in the link (#p=...). Renders with textContent only; nothing is sent anywhere.
(async () => {
  'use strict';
  const $ = id => document.getElementById(id), PL = window.GlowPlanLink;
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const packed = new URLSearchParams(location.hash.slice(1)).get('p') || '';
  let catalog = { items: [] };
  try { catalog = await (await fetch('catalog.json', { cache: 'no-cache' })).json(); } catch { /* names fall back to ids */ }
  const plan = await PL.unpack(packed), box = $('plan');
  if (!plan) {
    box.classList.add('empty'); box.textContent = 'This link doesn’t hold a plan, or it was cut short. Ask the planner for a new one.';
    $('openCard').hidden = true; $('copyText').disabled = true; return;
  }
  $('ptitle').textContent = plan.title; document.title = plan.title + ' · /Glow plan';
  const name = id => catalog.items.find(c => c.id === id);
  const head = t => box.appendChild(el('p', 'label sub', t));
  const later = plan.items.filter(x => x.when === 'later');
  const rows = list => list.forEach(it => { const c = name(it.id); if (!c) return;
    const r = el('div', 'item'); r.append(el('span', 'qty', it.qty + '×'), el('span', 'iname', c.name), el('span', 'badge ' + c.status, c.status === 'tested' ? 'Tested' : 'In testing'), el('span', 'iwhy', c.summary)); box.appendChild(r); });
  if (later.length) head('Order now'); rows(plan.items.filter(x => x.when !== 'later'));
  if (later.length) { head('Order later'); rows(later); }
  const ul = (t, a) => { if (!a.length) return; head(t); const u = el('ul'); a.forEach(x => u.appendChild(el('li', null, x))); box.appendChild(u); };
  ul('You’ll also need', plan.need);
  if (plan.mock) { head('Mock it up first'); box.appendChild(el('p', 'mock', plan.mock)); }
  if (plan.steps.length) { head('Steps'); const ol = el('ol'); plan.steps.forEach(s => { const li = el('li', null, s.do); if (s.check) li.appendChild(el('div', 'check', 'Check: ' + s.check)); ol.appendChild(li); }); box.appendChild(ol); }
  ul('Zones in /Glow', plan.zones);
  if (plan.budget) box.appendChild(el('p', 'budget', 'Rough budget (an estimate): ' + plan.budget));
  $('openApp').href = PL.intent(packed);
  if (!/Android/i.test(navigator.userAgent)) $('openCard').querySelector('p').textContent = 'Open this page on your Android phone (scan the code on the planner page) to bring the plan into /Glow.';
  $('copyText').addEventListener('click', async e => { try { await navigator.clipboard.writeText(PL.text(plan, catalog)); e.target.textContent = 'Copied ✓'; } catch { e.target.textContent = 'Copy didn’t work here'; } });
})();
