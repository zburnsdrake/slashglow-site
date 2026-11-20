// Phones: the header's secondary links fold into a "Menu ▾" pill, so the headline is on the first screen.
// The call to action (the filled button) stays visible. Without JavaScript the full link row shows as before.
(function(){
  var nav = document.querySelector('nav[aria-label="Main"]');
  if(!nav) return;
  var links = Array.prototype.filter.call(nav.children, function(a){ return a.tagName === 'A' && !/background/.test(a.getAttribute('style') || ''); });
  if(links.length < 2) return;

  var css = document.createElement('style');
  css.textContent =
    '.gm-btn{display:none;align-items:center;gap:8px;background:transparent;color:#e9ecf3;border:1px solid #2a3142;border-radius:999px;' +
    'padding:9px 18px;font:600 15px Inter,system-ui,sans-serif;cursor:pointer}' +
    '.gm-btn:focus-visible{outline:2px solid #8ea6ff;outline-offset:2px}' +
    '.gm-btn .gm-tri{font-size:11px;transition:transform .15s}.gm-btn[aria-expanded="true"] .gm-tri{transform:rotate(180deg)}' +
    '.gm-panel{display:contents}' +
    '@media (max-width:760px){' +
      'nav[aria-label="Main"]{gap:10px!important;flex-wrap:nowrap!important}' +
      '.gm-btn{display:inline-flex}' +
      '.gm-panel{display:none;position:absolute;left:16px;right:16px;top:100%;margin-top:4px;z-index:50;background:#141824;border:1px solid #2a3142;' +
        'border-radius:16px;padding:8px;box-shadow:0 12px 32px rgba(0,0,0,.45)}' +
      '.gm-panel.open{display:flex;flex-direction:column}' +
      '.gm-panel a{padding:12px 14px;border-radius:10px;font-size:16px!important}' +
      '.gm-panel a:hover,.gm-panel a:focus-visible{background:#1d2232}' +
      'header{position:relative}' +
    '}' +
    '@media (prefers-reduced-motion:reduce){.gm-btn .gm-tri{transition:none}}';
  document.head.appendChild(css);

  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'gm-btn';
  btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'gm-panel');
  btn.innerHTML = 'Menu <span class="gm-tri" aria-hidden="true">▼</span>';
  var panel = document.createElement('div');
  panel.className = 'gm-panel'; panel.id = 'gm-panel';
  nav.insertBefore(btn, links[0]);
  nav.insertBefore(panel, links[0]);
  links.forEach(function(a){ panel.appendChild(a); });

  function setOpen(on){ panel.classList.toggle('open', on); btn.setAttribute('aria-expanded', on ? 'true' : 'false'); }
  btn.addEventListener('click', function(e){ e.stopPropagation(); setOpen(!panel.classList.contains('open')); });
  panel.addEventListener('click', function(e){ if(e.target.closest('a')) setOpen(false); });
  document.addEventListener('click', function(e){ if(!nav.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && panel.classList.contains('open')){ setOpen(false); btn.focus(); } });
})();
