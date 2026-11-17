# /Glow planner Worker

Holds the AI key and the planner's scope, so the website itself never sees the key. Free Cloudflare plan is enough.

## What it does
- `POST /session`: checks Cloudflare Turnstile (bot check), returns a signed 6-hour session token.
- `POST /chat`: checks the session and the daily limits, asks Gemini with the scoped instructions in `src/prompt.js`, returns a reply plus a plan made only of items in `../catalog.json`.
- `GET /status`: whether today's global limit is still open.

## Limits (in `wrangler.toml`)
| Limit | Default |
| --- | --- |
| Per browser session per day | 25 messages |
| Per IP per day (hashed, generous because phones share IPs) | 60 messages |
| Everyone per day | 1,500 messages |
| Everyone per day, model tokens | 3,000,000 |

When a global limit is hit, the chat closes until 00:00 UTC.

## Privacy
- No request logs (`observability` off). Message text is never stored.
- IPs exist only as a salted, per-day hash inside the counters, deleted after 2 days.
- Use a **paid-tier** Gemini key so Google doesn't use the chats for training.

## Setup (Zachary)
1. Create a free Cloudflare account.
2. Turnstile → Add widget → hostname `slashglow.com` (add `www.slashglow.com` and `slashglow.app` too). Copy the site key into `plan.html` (`data-sitekey`); keep the secret key for step 4.
3. Get a Gemini API key from Google AI Studio on a billing-enabled (paid) project. Set a monthly budget alert in Google Cloud too.
4. In this folder: `npx wrangler login`, then set each secret yourself, pasting when asked:
   - `npx wrangler secret put GEMINI_API_KEY`
   - `npx wrangler secret put TURNSTILE_SECRET`
   - `npx wrangler secret put SESSION_SECRET` (any long random text)
   - `npx wrangler secret put IP_SALT` (any long random text)
5. `npx wrangler deploy`. Put the printed `https://slashglow-planner.<you>.workers.dev` URL into `plan.html` (`data-worker`).

## Tests
`node worker/test/test.mjs` (plain Node 22, no installs).
