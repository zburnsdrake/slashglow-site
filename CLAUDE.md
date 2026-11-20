# slashglow.com: notes for Claude

- Brand rules: `BRAND.md`. Above all: **Inter is the only typeface. Never use Space Grotesk** (not in headings, the logo, mockups, images or the app).
- Static site on GitHub Pages (custom domain slashglow.com via `CNAME`). Pages: index, cars, community, plan, open, testing, privacy, 404.
- Sign-ups post to Google Forms (`GLOW_SITE` in `assets/site.js`); form questions come from `scripts/signup_fields.py`. Bump the `?v=` on `assets/site.js` links when it changes.
- The planner Worker and its rules live in the **private** repo zburnsdrake/slashglow-planner (keep them out of this public repo). `catalog.json` and `planner.json` here are copies from it (planner.json holds only the `space` questions): edit them there, run its `scripts/sync.sh ../slashglow-site ../glow-lights`, then `node test/test.mjs` there.
- Google accounts and browsers: ORX-owned accounts (the sign-up forms and their Apps Script project, the sign-ups sheet, Play Console, Cloudflare) are used only in Zach's **ORX Chrome profile**. Before acting in Chrome, check which profile/account the browser is signed in to; if it's another profile, stop and ask rather than working there. In Apps Script, confirm the function dropdown shows the function you mean before pressing Run.
- Never commit secrets (`.dev.vars`, keys). Worker secrets are set in Cloudflare (or `wrangler secret put` from the planner repo).
