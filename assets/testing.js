// The gear list and the checklists that decide "Tested", straight from catalog.json.
(async () => {
  'use strict';
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const KIND = { kit: 'Car kits', controller: 'Controllers', strip: 'LED strips', power: 'Power', mounting: 'Mounting', wiring: 'Wiring', tool: 'Install tools', sound: 'Sound (not controlled by /Glow)' };
  const host = document.getElementById('gear');
  let c;
  try { c = await (await fetch('catalog.json', { cache: 'no-cache' })).json(); } catch { host.textContent = 'Couldn’t load the gear list.'; return; }
  for (const [k, title] of Object.entries(KIND)) {
    const items = c.items.filter(i => i.kind === k); if (!items.length) continue;
    const card = el('div', 'kind'); card.appendChild(el('h2', null, title));
    const checks = c.checklists?.[k] || [];
    if (checks.length) { card.appendChild(el('p', 'label', 'Checklist')); const ol = el('ol'); checks.forEach(x => ol.appendChild(el('li', null, x))); card.appendChild(ol); }
    items.forEach(i => { const r = el('div', 'gitem'); r.append(el('span', null, i.name), el('span', 'badge ' + i.status, i.status === 'tested' ? 'Tested' : 'In testing')); card.appendChild(r); });
    host.appendChild(card);
  }
})();
