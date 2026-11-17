// Tiny runtime for the site's interactive bits (the pages were designed as live components).
// Markup holds {{holes}}, <sc-for list="{{x}}" as="item"> loops and <sc-if value="{{x}}"> blocks;
// a page script defines `class Component extends DCLogic` with renderVals() and calls DC.mount(Component, props).
(() => {
  'use strict';
  class DCLogic { constructor(props){ this.props = props || {}; this.state = {}; } setState(p){ Object.assign(this.state, p || {}); DC.schedule(); } }
  const HOLE = /\{\{\s*([\w.$]+)\s*\}\}/g, ONE = /^\s*\{\{\s*([\w.$]+)\s*\}\}\s*$/;
  const get = (o, path) => path === 'true' ? true : path === 'false' ? false : path.split('.').reduce((v, k) => (v == null ? v : v[k]), o);
  const fill = (tpl, scope) => tpl.replace(HOLE, (_, p) => { const v = get(scope, p); return v == null ? '' : String(v); });
  const value = (tpl, scope) => { const m = ONE.exec(tpl || ''); return m ? get(scope, m[1]) : fill(tpl || '', scope); };
  const isSc = (n, tag) => n.nodeType === 1 && n.localName === tag;
  const DC = { comp:null, binds:[], regions:[], pending:false, vals:null };

  // build DOM for a template node with a scope (loops and ifs inside are expanded here)
  function build(n, scope, out){
    if(n.nodeType === 3){ out.appendChild(document.createTextNode(n.nodeValue.includes('{{') ? fill(n.nodeValue, scope) : n.nodeValue)); return; }
    if(n.nodeType !== 1) return;
    if(isSc(n, 'sc-for')){ const list = value(n.getAttribute('list'), scope) || [], as = n.getAttribute('as') || 'item';
      for(const item of list){ const s = Object.create(scope); s[as] = item; for(const c of n.childNodes) build(c, s, out); } return; }
    if(isSc(n, 'sc-if')){ if(value(n.getAttribute('value'), scope)) for(const c of n.childNodes) build(c, scope, out); return; }
    const el = document.importNode(n, false);
    for(const a of [...n.attributes]){
      if(!a.value.includes('{{')) continue;
      if(/^data-on-/.test(a.name)){ el.removeAttribute(a.name); const fn = value(a.value, scope); if(typeof fn === 'function') el.addEventListener(a.name.slice(8), fn); }
      else if(a.name.startsWith('data-dc-')){ el.removeAttribute(a.name); el.setAttribute(a.name.slice(8), fill(a.value, scope)); }
      else el.setAttribute(a.name, fill(a.value, scope));
    }
    for(const c of n.childNodes) build(c, scope, el);
    out.appendChild(el);
  }

  DC.schedule = () => { if(DC.pending) return; DC.pending = true; requestAnimationFrame(() => { DC.pending = false; DC.render(); }); };
  DC.render = () => {
    const vals = DC.vals = DC.comp.renderVals();
    for(const b of DC.binds){
      if(b.kind === 'text'){ const v = fill(b.tpl, vals); if(b.node.nodeValue !== v) b.node.nodeValue = v; }
      else if(b.kind === 'attr'){ const v = fill(b.tpl, vals); if(b.el.getAttribute(b.name) !== v) b.el.setAttribute(b.name, v); }
    }
    for(const R of DC.regions){ const frag = document.createDocumentFragment(); build(R.tpl, vals, frag); R.box.replaceChildren(frag); }
  };
  DC.mount = (Component, props) => {
    const root = document.querySelector('[data-dc-root]') || document.body;
    // outermost loops and ifs become regions, rebuilt on every render
    for(const t of [...root.querySelectorAll('sc-for, sc-if')]){
      if(!root.contains(t) || t.parentElement.closest('sc-for, sc-if')) continue;
      const svg = t.namespaceURI === 'http://www.w3.org/2000/svg';
      const box = svg ? document.createElementNS('http://www.w3.org/2000/svg', 'g') : document.createElement('div');
      if(!svg) box.style.display = 'contents';
      t.replaceWith(box); DC.regions.push({tpl: t, box});
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for(let n = walker.currentNode; n; n = walker.nextNode()){
      if(n.nodeType === 3){ if(n.nodeValue.includes('{{')) DC.binds.push({kind:'text', node:n, tpl:n.nodeValue}); continue; }
      for(const a of [...n.attributes]){
        if(!a.value.includes('{{')) continue;
        if(/^data-on-/.test(a.name)){ const path = (ONE.exec(a.value) || [])[1]; n.removeAttribute(a.name);
          n.addEventListener(a.name.slice(8), e => { const fn = path && get(DC.vals, path); if(typeof fn === 'function') fn(e); }); }
        else if(a.name.startsWith('data-dc-')){ n.removeAttribute(a.name); DC.binds.push({kind:'attr', el:n, name:a.name.slice(8), tpl:a.value}); }
        else DC.binds.push({kind:'attr', el:n, name:a.name, tpl:a.value});
      }
    }
    DC.comp = new Component(props);
    DC.render();
    if(DC.comp.componentDidMount) DC.comp.componentDidMount();
    addEventListener('pagehide', () => { try{ DC.comp.componentWillUnmount && DC.comp.componentWillUnmount(); }catch(e){} });
  };
  window.DCLogic = DCLogic; window.DC = DC;
})();
