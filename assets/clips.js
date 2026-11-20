// Real footage for the Music section: a silent, slowly scrolling strip of clips and photos above the scene.
// One list per page. An empty list keeps the carousel hidden, so nothing shows until there's real footage.
// Each item: { kind: 'video' | 'photo', src: 'assets/clips/name.mp4' or '.jpg', poster: 'assets/clips/name.jpg' (videos),
//              label: 'The car at night', note: 'Dash and footwells on the beat' }. Keep videos short, muted-friendly and small (≤ 3 MB).
window.GLOW_CLIPS = {
  home: [],
  cars: []
};
document.addEventListener('DOMContentLoaded', () => {
  const box = document.querySelector('[data-clips]'); if(!box) return;
  const list = (window.GLOW_CLIPS[box.dataset.clips] || []).filter(c => c && c.src); if(!list.length) return;
  const el = (tag, css, attrs) => { const e = document.createElement(tag); if(css) e.style.cssText = css; for(const k in attrs || {}) e.setAttribute(k, attrs[k]); return e; };
  const btn = (label, aria) => { const b = el('button', 'font: inherit; font-size: 15px; font-weight: 600; min-width: 44px; height: 44px; padding: 0 14px; border-radius: 22px; border: 1px solid #2a3142; background: #151922; color: #e9ecf3; cursor: pointer', { type: 'button' }); b.textContent = label; if(aria) b.setAttribute('aria-label', aria); return b; };
  const bar = el('div', 'display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 12px');
  const prev = btn('‹', 'Previous clip'), run = btn('Pause'), next = btn('›', 'Next clip'); bar.append(prev, run, next);
  const view = el('div', 'position: relative; overflow: hidden; border-radius: 20px', { 'aria-label': 'Clips and photos of /Glow lighting', role: 'region' });
  const track = el('div', 'display: flex; gap: 16px; will-change: transform');
  const H = () => (innerWidth < 600 ? 200 : 280);
  const frame = c => {
    const f = el('figure', `position: relative; flex: none; margin: 0; height: ${H()}px; border-radius: 16px; overflow: hidden; background: #0f121a; border: 1px solid #222838`);
    const m = c.kind === 'video' ? el('video', 'height: 100%; width: auto; display: block', { src: c.src, muted: '', loop: '', playsinline: '', autoplay: '', preload: 'metadata', ...(c.poster ? { poster: c.poster } : {}) })
                                 : el('img', 'height: 100%; width: auto; display: block', { src: c.src, alt: c.label || '', loading: 'lazy', decoding: 'async' });
    if(m.tagName === 'VIDEO'){ m.muted = true; m.setAttribute('aria-label', c.label || 'Video clip'); }
    f.append(m);
    if(c.label){ const cap = el('figcaption', 'position: absolute; left: 0; right: 0; bottom: 0; margin: 0; padding: 40px 16px 14px; font-size: 15px; font-weight: 600; color: #f2f4f8; background: linear-gradient(180deg, rgba(7,8,11,0), rgba(7,8,11,0.85))'); cap.textContent = c.label;
      if(c.note){ const n = el('span', 'display: block; margin-top: 3px; font-size: 13px; font-weight: 400; color: #b7bfd1'); n.textContent = c.note; cap.append(n); } f.append(cap); }
    return f;
  };
  for(const c of list.concat(list)) track.append(frame(c));   // two copies so the strip loops seamlessly
  track.lastElementChild && [...track.children].slice(list.length).forEach(f => f.setAttribute('aria-hidden', 'true'));
  view.append(track); box.append(bar, view); box.hidden = false;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let x = 0, running = !still, target = null, last = 0, onScreen = true;
  if(still) run.textContent = 'Play';
  if(window.IntersectionObserver) new IntersectionObserver(es => { onScreen = es[0].isIntersecting; for(const v of track.querySelectorAll('video')) onScreen ? v.play().catch(() => {}) : v.pause(); }).observe(view);
  const span = () => track.scrollWidth / 2 + 8;
  const starts = () => [...track.children].slice(0, list.length).map(f => f.offsetLeft);
  const jump = dir => { const s = starts(), w = span(); let i = s.findIndex(p => p > x + 1); if(dir < 0){ i = s.findIndex(p => p >= x - 1) - 1; if(i < 0) i = s.length - 1; } if(i < 0) i = 0;
    let t = s[i]; if(dir > 0 && t < x) t += w; target = t; running = false; run.textContent = 'Play'; };
  prev.onclick = () => jump(-1); next.onclick = () => jump(1);
  run.onclick = () => { running = !running; target = null; run.textContent = running ? 'Pause' : 'Play'; };
  const tick = now => { const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if(onScreen){ if(target != null){ const d = target - x; x += d * Math.min(1, dt * 6); if(Math.abs(d) < 0.5){ x = target; target = null; } } else if(running) x += 28 * dt;
      const w = span(); if(w > 0){ x = ((x % w) + w) % w; target != null && (target = target % w + (target >= w ? 0 : 0)); } track.style.transform = `translateX(${(-x).toFixed(1)}px)`; }
    requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
