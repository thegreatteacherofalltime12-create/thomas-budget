# Thomas Budget

A shared monthly household budget, built from the *Budgeting form 2026* spreadsheet.
One record per month with the same four columns as the sheet — **Net Income**,
**Expenses**, **Abnormal Expenses**, **Wealth Building** — plus breakdown items under
any line (paychecks, grocery log, per-card payments), a balances block (credit cards,
savings, 401K, mortgage), Chase CSV import with auto-categorization, charts that open
in an overlay, and JSON backup/restore.

## How it runs

| Piece | What | Where |
|---|---|---|
| App | `public/index.html` — one self-contained page, no build step | this repo |
| Hosting | Cloudflare Worker with static assets (`wrangler.jsonc`) | `https://shiny-mouse-ee83.prior-mixed-theme.workers.dev` |
| Sign-in | Firebase Authentication, Google provider | Firebase project **Something** |
| Data | Firestore — `months/{YYYY-MM}`, `transactions/{YYYY-MM}`, `settings/rules`; real-time sync, offline cache on phones | Firebase project **Something** |
| Access | `firestore.rules` — only the two household Google accounts can read or write anything | Firestore rules |

The page itself is public on the Worker URL, but it contains no data: everything lives
in Firestore behind the sign-in and the rules. Opened without a Firebase config (for
example straight from disk) the page runs in a **this-device-only** mode using the
browser's local storage.

## Deploying

```bash
npx wrangler login          # once, opens the browser
npx wrangler deploy         # every time public/ changes
```

Firestore rules: paste `firestore.rules` into Firebase console → Firestore Database →
Rules → **Publish** (or `firebase deploy --only firestore:rules`).

## One-time Firebase setup (project **Something**)

1. **Authentication → Sign-in method** → enable **Google**. Leave Email/Password off.
2. **Authentication → Settings → Authorized domains** → add
   `shiny-mouse-ee83.prior-mixed-theme.workers.dev`.
3. **Firestore Database** → create (production mode) → **Rules** → paste `firestore.rules`.
4. **Project settings → General → Your apps** → Web app → copy the `firebaseConfig`
   object into `FIREBASE_CONFIG` near the top of the script in `public/index.html`.
5. Open the site, sign in, **Restore** the backup file (kept outside the repo in
   `private/`) — that loads the 2026 months from the spreadsheet.

## Month math (same as the sheet)

| Figure | Formula |
|---|---|
| Month Performance | Net Income − Expenses − Abnormal Expenses |
| Excluding Abnormal Expenses | Net Income − Expenses |
| Income Retained | Net Income − Expenses − Abnormal Expenses − Wealth Building |

A line with breakdown items always equals the sum of its items.

## Chase import

Chase → account → *Account activity* → download → **Spreadsheet (Excel, CSV)**.
Import it from a month's page; each row is matched to a line (Chase's category, the
merchant name, and any rule learned from a previous correction). Assigning a merchant
once is remembered for next time.

## Backups

**Back up** on the home page downloads a JSON file of every month, transaction and
merchant rule. **Restore** loads one (months in the file replace months with the same
name; others are kept). The `private/` folder is git-ignored and never deployed.
