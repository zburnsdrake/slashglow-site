# slashglow.com: notes for Claude

- Brand rules: `BRAND.md`. Above all: **Inter is the only typeface. Never use Space Grotesk** (not in headings, the logo, mockups, images or the app).
- Static site on GitHub Pages (custom domain slashglow.com via `CNAME`). Pages: index, cars, community, plan, open, testing, privacy, 404.
- Sign-ups post to Google Forms (`GLOW_SITE` in `assets/site.js`); form questions come from `scripts/signup_fields.py`. Bump the `?v=` on `assets/site.js` links when it changes.
- The planner's rules and parts list (`planner.json`, `catalog.json`) are shared with the app: run `scripts/sync-app.sh ../glow-lights` after changing them, and `node worker/test/test.mjs`.
- Never commit secrets (`.dev.vars`, keys); Worker secrets are set with `wrangler secret put`.
