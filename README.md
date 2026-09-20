# Thomas Budget

A shared monthly household budget for two people, rebuilt as a web app from the
spreadsheet we had been keeping by hand. Installable on a phone, syncs live between
both of us, works offline, and keeps the spreadsheet's own vocabulary and math.

**Live:** https://shiny-mouse-ee83.prior-mixed-theme.workers.dev (sign-in required — the
data is ours; the code is here for anyone.)

## What it does

- **One page per month** with the four columns from the original sheet — *Net Income,
  Expenses, Abnormal Expenses, Wealth Building* — and the three figures we care about:
  Month Performance, Excluding Abnormal Expenses, and **Income Retained**.
- **Breakdown items** under any line (paychecks, a grocery log, per-card payments); the
  line total is always the sum of its items.
- **Balances block** — credit cards → total debt, cash savings, 401K and mortgage balances.
- **Charts in an overlay** — where the month's money went, per-column bars, a nine-month
  trend, and credit-card debt over time. Every chart has a table view.
- **New month** copies last month's structure, keeps the amounts that repeat (mortgage,
  insurance, 401k), carries balances forward, and pre-fills "money left over".
- **Budgets** — name a spending limit; it is tracked against the Expenses line with the same name (created for you if missing), with a meter that turns amber near the limit and red over it. Budgets carry forward into new months. Pick the category from a dropdown of your Expenses lines, or type a new one. An Expenses line whose amount is identical three months running is flagged a **standard monthly expense** and drops out of the budget meters automatically (no model, no network — plain arithmetic over the months already loaded).
- **Backup / restore** as JSON.
- **Month picker** on the home page and in the month header to jump anywhere in one tap.
- **Update button** appears when a new version is deployed; one tap reloads to it.
- **Phone-first**: single-column layout, large touch targets, full-screen overlays,
  installable (web app manifest + service worker), offline via Firestore's local cache.

## How it's built

| Piece | Choice | Why |
|---|---|---|
| App | One HTML file, vanilla JS, hand-drawn SVG charts (`public/index.html`) | No build step; the whole thing is readable in one sitting |
| Hosting | Cloudflare Worker with static assets (`wrangler.jsonc`) | Free, global, one-command deploy |
| Sign-in | Firebase Authentication, Google provider | Both of us already have Google accounts; no passwords to manage |
| Data | Firestore — one document per month, `months/{YYYY-MM}` | Real-time listeners for live sync, offline persistence on phones |
| Access | `firestore.rules` allow-listing two Google accounts | The security boundary lives server-side, not in the page |

Editing model: inputs update in-memory state and recompute totals instantly; writes are
debounced (700 ms) and the month document is replaced whole. Incoming snapshots never
overwrite a month with unsaved local edits (a per-month dirty flag), and the two-device
case falls back to last-writer-wins on the month document.

Charts follow a fixed, colorblind-checked palette: net income (blue), expenses (orange),
wealth building (aqua), abnormal (yellow), retained (violet), debt (red) — the same identity
in every chart and on every tile.

## Privacy and security

- **No data in this repo or in the page.** The site's HTML is public; every figure lives in
  Firestore and is only readable by the two allow-listed accounts. The Firebase web config in
  the page is a public identifier by design; the rules are the boundary.
- The committed `firestore.rules` uses placeholder addresses; the deployed copy has the real ones.
- Security headers via `public/_headers`; `robots.txt` and `X-Robots-Tag` keep it out of search.
- The `private/` folder (our backup files) is git-ignored and never deployed.

## Running your own copy

1. Create a Firebase project → enable **Authentication → Google** → create a **Firestore**
   database → paste `firestore.rules` with your two emails → **Publish**.
2. Project settings → Your apps → Web app → copy the config into `FIREBASE_CONFIG` near the
   top of the script in `public/index.html`.
3. `npx wrangler login`, set your Worker name in `wrangler.jsonc`, `node deploy.js`.
4. Add the deployed domain under **Authentication → Settings → Authorized domains**.
5. Open the site, sign in, and start a month (or **Restore** a backup).

Without a `FIREBASE_CONFIG`, the page runs in a this-device-only mode using local storage.

## Month math (same as the sheet)

| Figure | Formula |
|---|---|
| Month Performance | Net Income − Expenses − Abnormal Expenses |
| Excluding Abnormal Expenses | Net Income − Expenses |
| Income Retained | Net Income − Expenses − Abnormal Expenses − Wealth Building |
