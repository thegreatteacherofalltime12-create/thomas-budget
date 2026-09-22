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
- **Charts in an overlay** — where the month's money went, per-column bars, the calendar-year trend, credit-card debt and savings over time. Every chart has a table view.
- **Trends & balances** — one card on the home page opens a list of every trend window (trends data, savings & wealth, retirement, retained by month, the year outlook, home equity, credit-card debt, balances); each opens its own overlay with a way back to the list.
- **New month appears by itself on the 1st** — the first time the app opens in a calendar month with no record, it creates one from the previous month (also available manually). It copies last month's structure, keeps the amounts that repeat (mortgage,
  insurance, 401k), carries balances forward, and pre-fills "money left over".
- **Budgets** — name a spending limit; it is tracked against the Expenses line with the same name (created for you if missing), with a meter that turns amber near the limit and red over it. Budgets carry forward into new months. Pick the category from a dropdown of your Expenses lines, or type a new one. An Expenses line whose amount is identical three months running is flagged a **standard monthly expense** and drops out of the budget meters automatically (no model, no network — plain arithmetic over the months already loaded).
- **Amount boxes are calculators** — type `45+30.50` or `3*12.99`; totals update as you type, the box shows the result when you leave it, and breakdown items keep the formula as a note (like the sheet did).
- **Undo on every amount box** — each box remembers what it held before each edit; a small ↶ appears inside it after a change and steps back one edit at a time, in every section (income, expenses, budgets, balances, breakdown items, the church ledger).
- **Year outlook** — projects net income and money kept by December 31. Entered months count as they are, the current month uses its end-of-month outlook, and each remaining month starts from the same month last year scaled by how this year is running against it (falling back to this year's average). Compared with last year, charted as a running total with the predicted part dashed; resets every January and recomputes on every edit.
- **End-of-month outlook** — starts from what last month left over and assumes every income, expense and wealth-building line reaches at least its usual amount (average of the last three months it had a value); abnormal expenses count only as entered. Tap the card for the line-by-line breakdown.
- **LDS church expenses** — a separate reimbursable ledger at the bottom of the home page (date, description, amount, paid), with a graph of spend per month; a pencil in its window renames it. Stored on its own and never counted in any budget figure.
- **Backup / restore** as JSON.
- **Rename the budget** — tap its name in the header; the name is shared (Firestore `settings/app`). The header stays quiet: no sync pill unless something failed to save.
- **Appreciation assets** — the home: what it is worth and the mortgages against it. Each row is tagged worth / owed / other, and the group shows equity, the share of the value it represents, and what has been built this year. Every mortgage row picks where its principal comes from: a dropdown of the Home equity lines in wealth building (add one line per mortgage), or a box to type it in. Whatever the linked line says comes straight off that balance and follows it as it changes, so the balances, the equity and the year’s build always agree; links and amounts carry into each new month. It carries into each new month and has its own worth / owed / equity chart.
- **Arrange the trends list** — start sliding a row to the right and it is held for moving, with a light green “Move tab” panel out while your finger is down; drag it where you want it. The order is kept with the budget (`settings/app.trendsOrder`), so it follows to any device.
- **Put a tab away** — swipe a row left; the right-hand side turns red and says Delete, and past about 80px it is put away (kept in `settings/app.trendsHidden`). Put-away tabs are listed under the list and come back with one tap.
- **Add a tab** — every chart, the retirement window, the year outlook and Balances carry a **+ Add to Trends & Balances** button at the end; charts that were never on the list (where the money went, the per-column bars) can be added that way and are kept in `settings/app.trendsAdded`.
- **Retirement** — a Trends window projecting the monthly withdrawal a retirement pot supports. The pot is savings in cash plus the other balances that are money owned (a 401K, an HSA; anything that reads as owed, like a mortgage, is left out), grown at a rate you set with wealth building added each month, then annuitised over the retirement years you choose; the figure is also shown in today’s money. Settings live in `settings/app.retire`.
- **One window at a time** — while windows are open the app holds a single history entry and steps back one window per back press, whether the phone delivers it as a history pop (iOS) or as a dialog close request (Android).
- **Suggestions & bugs** — a card at the bottom of the home page opens a window where anyone on the budget can send a bug report or an idea (Firestore `feedback/<id>`). Whoever first claims it becomes the administrator (`settings/app.admin`), sees every note with who sent it, and marks them fixed; others see only their own notes and their status.
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
| Data | Firestore — one document per month, `months/{YYYY-MM}`; the church ledger in `ledgers/church` | Real-time listeners for live sync, offline persistence on phones |
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
