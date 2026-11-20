// Site settings: fill these in, everything else follows.
window.GLOW_SITE = {
  // Sign-up forms. With Google Forms: in the form's ⋮ menu choose "Get pre-filled link", fill every
  // question with something, copy the link, and paste the parts here:
  //   action: the link up to "/viewform", with "/formResponse" in its place
  //   fields: each "entry.123456" from the link, for the question it belongs to
  // Empty action = the button says sign-ups open soon.
  beta:   { action: 'https://docs.google.com/forms/d/e/1FAIpQLSdxSAbXe_LhPxwq_RIkFSu3ZCBqXJdBGMU34ej3gURJGOJKQQ/formResponse',
            fields: { email: 'entry.413371805', car: 'entry.1372020356', kit: 'entry.1728377926', phone: 'entry.260600615',
                      music: 'entry.1675183833', weekly: 'entry.1055466153', later: 'entry.1558123359', heard: 'entry.295920219' } },
  iphone: { action: 'https://docs.google.com/forms/d/e/1FAIpQLSda9Tr7MVfzAi8-secygXotVYRhbRutwRvuCdI3-MAUsNwslg/formResponse',
            fields: { email: 'entry.2017772158', car: 'entry.989577901', kit: 'entry.1012979735' } },
  home:   { action: 'https://docs.google.com/forms/d/e/1FAIpQLSdDLaifOQYdX22TSP68Gu9bwEXi5tFeDNwtwFCxACHi2klYuQ/formResponse',
            fields: { email: 'entry.1944140057', what: 'entry.884339454', lights: 'entry.437712196', phone: 'entry.2056392084', heard: 'entry.1278988845' } },
  // Community subreddit, e.g. 'https://www.reddit.com/r/slashglow'. Empty = the button stays hidden.
  reddit: ''
};
const DONE = {
  beta: 'Thanks! Watch your inbox for the Google Play invite.',
  iphone: 'Thanks! We’ll email you when /Glow for iPhone is ready to test.',
  home: 'Thanks! We’ll email you when the home beta opens.'
};
document.addEventListener('DOMContentLoaded', () => {
  const S = window.GLOW_SITE;
  for(const f of document.querySelectorAll('form[data-form]')){
    const cfg = S[f.dataset.form] || {}, btn = f.querySelector('button[type=submit]'), msg = f.querySelector('[data-form-msg]');
    if(!cfg.action){ btn.disabled = true; btn.style.opacity = '0.55'; btn.style.cursor = 'default'; btn.textContent = 'Sign-ups open soon'; f.addEventListener('submit', e => e.preventDefault()); continue; }
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const body = new URLSearchParams();   // sent form-encoded, the way Google Forms expects
      for(const [name, entry] of Object.entries(cfg.fields || {})){
        if(!entry) continue;
        // checkboxes send one value per ticked box; text fields send their text
        const boxes = [...f.querySelectorAll(`input[type=checkbox][name="${name}"]`)];
        if(boxes.length){ boxes.filter(b => b.checked).forEach(b => body.append(entry, b.value)); continue; }
        const el = f.elements[name]; if(el && el.value.trim()) body.append(entry, el.value.trim());
      }
      btn.disabled = true; const label = btn.textContent; btn.textContent = 'Sending…';
      try{
        // Google Forms accepts the post but doesn't let a page read its answer, so a sent request counts as done
        await fetch(cfg.action, { method: 'POST', mode: 'no-cors', body });
        f.reset(); btn.textContent = 'Sent ✓';
        if(msg) msg.textContent = DONE[f.dataset.form] || DONE.beta;
      }catch(err){ btn.disabled = false; btn.textContent = label; if(msg) msg.textContent = 'Couldn’t send that. Check your connection and try again.'; }
    });
  }
  for(const a of document.querySelectorAll('a[data-link="reddit"]')) if(S.reddit){ a.href = S.reddit; a.hidden = false; a.target = '_blank'; a.rel = 'noopener'; }
});
