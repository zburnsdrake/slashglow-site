// Site settings: fill these in, everything else follows.
window.GLOW_SITE = {
  // Sign-up form links (Tally or Google Forms). Empty = the buttons say sign-ups open soon.
  betaForm: '',
  iphoneForm: '',
  // Community subreddit, e.g. 'https://www.reddit.com/r/slashglow'. Empty = the button stays hidden.
  reddit: ''
};
document.addEventListener('DOMContentLoaded', () => {
  const S = window.GLOW_SITE;
  for(const a of document.querySelectorAll('a[data-form]')){
    const url = a.dataset.form === 'iphone' ? S.iphoneForm : S.betaForm;
    if(url){ a.href = url; a.target = '_blank'; a.rel = 'noopener'; }
    else { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); a.style.opacity = '0.55'; a.style.cursor = 'default'; a.textContent = 'Sign-ups open soon'; }
  }
  for(const a of document.querySelectorAll('a[data-link="reddit"]')) if(S.reddit){ a.href = S.reddit; a.hidden = false; a.target = '_blank'; a.rel = 'noopener'; }
});
