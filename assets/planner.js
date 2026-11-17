// /Glow planner page. Talks to the planner Worker; never holds an API key.
(() => {
  'use strict';
  const cfg = document.body.dataset;
  const WORKER = (cfg.worker || '').replace(/\/$/, '');
  const SITEKEY = cfg.sitekey || '';
  const TAG = cfg.amazonTag || '';
  const $ = id => document.getElementById(id);
  const log = $('log'), form = $('form'), input = $('input'), send = $('send'), chips = $('chips'), banner = $('banner');

  const STARTERS = [
    'Lights behind my TV that move with movies',
    'A gaming desk that pulses with music',
    'Under-cabinet lights in my kitchen',
    'Ambient lighting in my car',
    'Speakers and shelves that glow to music'
  ];

  let catalog = null, session = null, busy = false;
  const turns = []; // [{role:'user'|'model', text}]

  // ---------- rendering (text only, no HTML from the network) ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function inline(parent, text) {
    // **bold** only
    text.split(/(\*\*[^*]+\*\*)/).forEach(part => {
      if (/^\*\*[^*]+\*\*$/.test(part)) parent.appendChild(el('strong', null, part.slice(2, -2)));
      else if (part) parent.appendChild(document.createTextNode(part));
    });
  }
  function richText(container, text) {
    const blocks = String(text).split(/\n{2,}/);
    for (const b of blocks) {
      const lines = b.split('\n').filter(l => l.trim());
      if (!lines.length) continue;
      if (lines.every(l => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
        const list = el(/^\s*\d/.test(lines[0]) ? 'ol' : 'ul');
        lines.forEach(l => { const li = el('li'); inline(li, l.replace(/^\s*([-*•]|\d+[.)])\s+/, '')); list.appendChild(li); });
        container.appendChild(list);
      } else {
        const p = el('p'); inline(p, lines.join(' ')); container.appendChild(p);
      }
    }
  }
  function scroll() { log.scrollTop = log.scrollHeight; }
  function addMsg(role, text, label) {
    const m = el('div', 'msg ' + role);
    if (label) m.appendChild(el('p', 'label', label));
    richText(m, text);
    log.appendChild(m); scroll();
    return m;
  }
  function note(text) { log.appendChild(el('div', 'msg note', text)); scroll(); }

  function buyLinks(item) {
    const wrap = el('div', 'buy');
    let any = false;
    if (item.status === 'tested' || item.status === 'testing') {
      if (TAG && item.amazon) {
        const a = el('a', null, 'Amazon (paid link)');
        a.href = `https://www.amazon.com/dp/${encodeURIComponent(item.amazon)}?tag=${encodeURIComponent(TAG)}`;
        a.target = '_blank'; a.rel = 'sponsored noopener';
        wrap.appendChild(a); any = true;
      }
      if (item.store) {
        const a = el('a', null, `${item.store.label} (paid link)`);
        a.href = item.store.url; a.target = '_blank'; a.rel = 'sponsored noopener';
        wrap.appendChild(a); any = true;
      }
    }
    if (!any) wrap.appendChild(el('span', null, 'Link coming soon'));
    return { wrap, any };
  }

  function renderPlan(plan, label) {
    const box = el('div', 'plan');
    if (label) box.appendChild(el('p', 'label', label));
    box.appendChild(el('h3', null, plan.title || 'Your setup'));
    const rows = [];
    let anyLink = false;
    for (const it of plan.items) {
      const item = catalog.items.find(c => c.id === it.id);
      if (!item) continue;
      const row = el('div', 'item');
      row.appendChild(el('span', 'qty', `${it.qty}×`));
      row.appendChild(el('span', 'iname', item.name));
      row.appendChild(el('span', 'badge ' + item.status, item.status === 'tested' ? 'Tested' : 'Testing'));
      row.appendChild(el('span', 'iwhy', it.why || item.summary));
      const { wrap, any } = buyLinks(item);
      anyLink = anyLink || any;
      row.appendChild(wrap);
      rows.push(row);
    }
    if (anyLink) box.appendChild(el('p', 'disclose', 'Paid links: /Glow earns a small commission if you buy, at no cost to you. We only list gear /Glow has tested or is testing.'));
    rows.forEach(r => box.appendChild(r));
    if (plan.steps?.length) {
      box.appendChild(el('p', 'label sub', 'Steps'));
      const ol = el('ol'); plan.steps.forEach(s => ol.appendChild(el('li', null, s))); box.appendChild(ol);
    }
    if (plan.zones?.length) {
      box.appendChild(el('p', 'label sub', 'Zones in /Glow'));
      const ul = el('ul'); plan.zones.forEach(s => ul.appendChild(el('li', null, s))); box.appendChild(ul);
    }
    if (plan.budget) box.appendChild(el('p', 'budget', `Rough budget (our estimate): ${plan.budget}`));
    log.appendChild(box); scroll();
  }

  function setChips(list) {
    chips.textContent = '';
    (list || []).forEach(t => {
      const b = el('button', 'chip', t); b.type = 'button';
      b.addEventListener('click', () => { if (!busy && !send.disabled) ask(t); });
      chips.appendChild(b);
    });
  }

  function closeChat(message) {
    banner.textContent = message; banner.hidden = false;
    input.disabled = true; send.disabled = true; setChips([]);
  }

  // ---------- Worker calls ----------
  async function post(path, body) {
    const r = await fetch(WORKER + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let data = null; try { data = await r.json(); } catch { /* ignore */ }
    return { status: r.status, data };
  }

  let tsWidget = null, tsResolve = null;
  function turnstileToken() {
    return new Promise((resolve, reject) => {
      if (!window.turnstile) return reject(new Error('check'));
      tsResolve = resolve;
      if (tsWidget === null) {
        tsWidget = window.turnstile.render('#ts', {
          sitekey: SITEKEY, appearance: 'interaction-only', theme: 'dark',
          callback: t => { const f = tsResolve; tsResolve = null; f && f(t); },
          'error-callback': () => reject(new Error('check'))
        });
      } else {
        window.turnstile.reset(tsWidget);
      }
    });
  }

  async function ensureSession(force) {
    if (session && !force) return session;
    const token = await turnstileToken();
    const r = await post('/session', { turnstile: token });
    if (r.status !== 200 || !r.data?.session) throw new Error('check');
    session = r.data.session;
    return session;
  }

  function planMemo(plan) {
    return `\n[Plan shown: ${plan.title} — ` + plan.items.map(i => `${i.id}×${i.qty}`).join(', ') + ']';
  }

  async function ask(text) {
    text = text.trim();
    if (!text || busy) return;
    busy = true; send.disabled = true; setChips([]);
    addMsg('user', text);
    turns.push({ role: 'user', text });
    input.value = ''; autoGrow();
    const typing = el('div', 'msg bot'); typing.innerHTML = '<span class="dots" aria-label="Thinking"><span></span><span></span><span></span></span>';
    log.appendChild(typing); scroll();
    try {
      await ensureSession(false);
      let r = await post('/chat', { session, messages: turns });
      if (r.status === 401) { await ensureSession(true); r = await post('/chat', { session, messages: turns }); }
      typing.remove();
      if (r.status === 200) {
        const a = r.data;
        addMsg('bot', a.reply);
        if (a.plan) renderPlan(a.plan);
        turns.push({ role: 'model', text: a.reply + (a.plan ? planMemo(a.plan) : '') });
        setChips(a.followUps);
        if (a.remaining === 3) note('3 messages left today. You can keep planning in the /Glow app.');
      } else {
        turns.pop();
        if (r.status === 429 && r.data?.scope === 'global') closeChat('The planner is resting for today because it hit its daily limit. Come back tomorrow, or plan from a photo in the /Glow app.');
        else if (r.status === 429) closeChat("You've reached today's planning limit. Come back tomorrow, or keep planning in the /Glow app.");
        else note('The planner is busy right now. Try again in a moment.');
      }
    } catch {
      typing.remove(); turns.pop();
      note("Couldn't reach the planner. Check your connection and try again.");
    } finally {
      busy = false;
      if (!input.disabled) send.disabled = false;
      input.focus();
    }
  }

  // ---------- composer ----------
  function autoGrow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; }
  input.addEventListener('input', autoGrow);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
  form.addEventListener('submit', e => { e.preventDefault(); ask(input.value); });

  // ---------- preview (before the Worker exists) ----------
  const EXAMPLE = {
    user: 'Family room media center: I want a glow along the soffit above the TV wall, a TV backlight, under-counter lights and the two speakers lit up, all moving with music and movies.',
    reply: "Nice setup. I'd make it **five zones** so each part can do its own thing, then group them in /Glow for music and Movie mode.\n\n- Soffit and under-counter get the brighter, longer runs, so each gets its own controller and supply.\n- The TV backlight is a short run; a small controller is enough.\n- The speakers use USB controllers, so no extra adapters there.\n\nMeasure each run before ordering and size every supply from the strip's rated current with about 20% headroom.",
    plan: {
      title: 'Family room media center',
      items: [
        { id: 'sp630e', qty: 2, why: 'Soffit and under-counter, the two long runs.' },
        { id: 'sp110e', qty: 1, why: 'TV backlight.' },
        { id: 'sp620e', qty: 2, why: 'One per speaker, USB powered.' },
        { id: 'ws2812b-5v', qty: 3, why: 'Soffit, under-counter and TV. Cut to length.' },
        { id: 'psu-5v-8a', qty: 3, why: 'One per 5V zone.' },
        { id: 'usb-charger-2a', qty: 1, why: 'Powers the speaker controllers.' },
        { id: 'alu-channel', qty: 1, why: 'A pack for the soffit and under-counter runs.' },
        { id: '3pin-l-connector', qty: 1, why: 'A pack for the soffit corners.' },
        { id: 'jst-pigtail', qty: 1, why: 'A pack to reach each controller.' }
      ],
      steps: ['Measure each run and pick strip lengths.', 'Test every strip on its controller before mounting.', 'Mount strips in the channels and route leads to the outlets.', 'Open /Glow: each controller shows up as a zone; name them and group them.'],
      zones: ['Soffit', 'TV', 'Under-counter', 'Speaker L', 'Speaker R'],
      budget: 'about $200–250 for everything'
    }
  };

  async function loadCatalog() {
    const r = await fetch('catalog.json', { cache: 'no-cache' });
    catalog = await r.json();
  }

  async function start() {
    try { await loadCatalog(); } catch { catalog = { items: [] }; }
    if (TAG) $('assoc').hidden = false;

    if (!WORKER) {
      addMsg('user', EXAMPLE.user, 'Example');
      addMsg('bot', EXAMPLE.reply, 'Example reply');
      renderPlan(EXAMPLE.plan, 'Example plan');
      log.scrollTop = 0;
      closeChat('Preview: the live planner opens with the website launch. Above is an example of what a plan looks like.');
      return;
    }

    addMsg('bot', "Hi! I'm the /Glow planner. Tell me about the space you want to light: a room, TV wall, desk, kitchen or car. What is it, and what do you want it to feel like?");
    setChips(STARTERS);
    try {
      const r = await fetch(WORKER + '/status');
      const s = await r.json();
      if (s && s.open === false) closeChat('The planner is resting for today because it hit its daily limit. Come back tomorrow, or plan from a photo in the /Glow app.');
    } catch { /* the first message will report problems */ }

    if (SITEKEY) {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true; document.head.appendChild(s);
    }
  }

  start();
})();
