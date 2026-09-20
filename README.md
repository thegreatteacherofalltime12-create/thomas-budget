# Thomas Budget

A shared monthly household budget, built from the *Budgeting form 2026* spreadsheet.
One record per month with the same four columns as the sheet — **Net Income**,
**Expenses**, **Abnormal Expenses**, **Wealth Building** — plus breakdown items under
any line (paychecks, grocery log, per-card payments), a balances block (credit cards,
savings, 401K, mortgage), Chase CSV import with auto-categorization, and charts that
open in an overlay.

The live, shared version runs as a Claude artifact with a shared database, so both of
us see the same numbers from any device:
https://claude.ai/artifact/GUr6asPits8PgqzPHA73Lm

## Running it elsewhere

`index.html` is a single self-contained page (no build step). Opened directly in a
browser — or hosted anywhere static — it runs in **this-device-only** mode: data is
kept in that browser's local storage and is not shared. The spreadsheet's 2026 months
are embedded as starting data so the page is usable immediately.

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

> This repository contains real household figures. Keep it private.
