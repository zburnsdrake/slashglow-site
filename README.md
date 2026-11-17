# slashglow.com

The /Glow: Light Studio website, served by GitHub Pages from this repo (plain HTML, no build step).

| Page | What it is |
| --- | --- |
| `index.html` | Home |
| `cars.html` | Cars and trucks |
| `community.html` | Community gallery (starter looks; shared looks get added here) |
| `plan.html` | The AI planner (needs the Worker below) |
| `privacy.html` | Privacy policy (linked from Google Play) |

- **Settings:** `assets/site.js` holds the sign-up form links and the subreddit link.
- **Planner:** `plan.html` reads `data-worker`, `data-sitekey` and `data-amazon-tag` from its `<body>`. Until `data-worker` is set it shows an example plan with the chat closed. The Worker is in `worker/` (see its README); its tests run with `node worker/test/test.mjs`.
- **Parts list and planner rules:** `catalog.json` (the gear /Glow has tested) and `planner.json` (how the planner asks, plans and stays safe) are shared with the app. Edit them here, then run `scripts/sync-app.sh ../glow-lights`; the Worker tests fail if the app's copies differ.
- **Interactive bits** (the demo beat, the community filters) run on `assets/dc-lite.js` plus one script per page.
