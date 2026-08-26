# Auto Commissions — React

Front end for the OWE Auto Commissions system. Self-contained: its own
`package.json`, no monorepo dependency.

## Run it

```bash
cp .env.example .env
# set VITE_API_BASE_URL=http://66.42.90.20:28975 in .env
npm install
npm run dev          # http://localhost:5173
```

```bash
npm run build        # dist/
npm run preview
```

## Deploying to Vercel

Import the repo — Vercel detects Vite and needs no build config
(`npm run build` → `dist/`).

**No environment variables are required.** The one thing that matters is
`vercel.json`, which does two jobs:

1. **Proxies the API.** The commission API sends no CORS headers, so a browser
   cannot call it directly from another origin. The app requests the
   same-origin path `/__api/*`, which Vercel rewrites to the API. Vite's dev
   server does the same thing locally, so both environments behave identically.
2. **Serves the SPA.** All other paths fall through to `index.html`.

**To point at a different API**, edit the `destination` in `vercel.json`
(and `VITE_API_BASE_URL` in `.env` for local dev).

If the API ever starts sending CORS headers, set `VITE_USE_PROXY=false` and the
client will call `VITE_API_BASE_URL` directly instead.

## What's here

All 15 tabs from the original, in two groups.

**Payments** (ecosystem-scoped — the Dealer / Sales Reps toggle re-scopes all of these)

| Tab | What it does |
|---|---|
| Pipeline Overview | Pre-install projects, KPI tiles, rate-coverage badges. **No commission figures** — nothing has reached a paying milestone. |
| Pending Approval | Unapproved, changed, or unpriced lines. Batch approve with a confirmation. |
| Ready to Pay | Approved and snapshot-matched. Also shows `scheduled` lines so the pay run can see what's coming. |
| Pay Statements | Per-party rollup — jobs, earned, settled, net due. Expands to per-line detail with milestone stages. |
| Exposure | Advances outstanding against pipeline commission. |
| Payment Records | Settled lines. |
| On Hold | Held with a reason. Reversible. |
| Advances | Create, approve (two distinct signatures), close. |

**Admin**

| Tab | What it does |
|---|---|
| Dealer Rates / Sales Rep Rates | Generic CRUD over 20 settings tables — add, edit, end-date, void, export, journal. |
| Payout Logic | Static reference: the formulas, the milestone matrix, where each input comes from. |
| Manual Payments | Off-cycle payments needing two distinct sign-offs. |
| Open Items | Reconciliation queue grouped by reason. |
| Tickets | Team feedback with status and waiting-on. |
| Access | People, roles, requests, and the role → tab matrix. |

## The line drawer

Click any OUR# to open it. The drawer renders the stored `calc` as a labelled math
table, so a figure traces back to its inputs:

```
Contract                              $36,934.10
Redline · RL 1.8/W × 9,315 W         −$16,767.00
Adders                               −$10,000.00
Total commissions                     $10,167.10
− Sales rep pay                       −$7,372.60
Dealer commission                      $2,794.50
```

Four branches, matching the original: dealer pot, rep margin, held/pre-trigger, and
the fallback. Milestone plans render as a stage table with cumulative targets.

## Behaviour carried over deliberately

- **Money to cents.** Rounding made the display disagree with the stored and exported figure.
- **Cumulative milestone targets.** M1 sits *inside* M2. Additive percentages overpay — that mistake cost 115% in a sibling system.
- **Confirmation on batch approve.** The original has none; one mis-click can approve six figures.
- **$0 redline guard.** A $0 redline means no redline is subtracted, so the whole contract becomes commission. Saving one asks first.
- **Two distinct signatures** on advances and manual payments; the creator can't approve their own advance.
- **CSV-injection defence** on every export — a cell starting `= + - @` gets quoted.
- **Empty ≠ all-clear.** A list that means "nothing to do" says so rather than rendering blank.
- **Approval snapshots.** A changed line drops back to Pending.
- **Date-effective settings.** Rate changes end-date the old row rather than editing it.

## The API

The app talks to the **OWE Commission API**. Every URL decision lives in `.env`:

```
VITE_API_BASE_URL=http://66.42.90.20:28975   # change this and nothing else when the API moves
VITE_API_PREFIX=/api/commission/v1
VITE_API_TOKEN=                              # blank on staging; auth is off there
VITE_API_TIMEOUT_MS=20000
VITE_DEV_PROXY=true
```

Copy `.env.example` to `.env`. `.env` is gitignored; `.env.example` is the committed template.

### Layers

| File | Job |
|---|---|
| `src/lib/api.js` | The only place that builds URLs or calls `fetch`. One function per endpoint. |
| `src/lib/useApi.js` | `useApi()` — runs one request and exposes loading / error / data / reload. `useDebounced()` for search boxes. |
| `src/components/ui.jsx` | `<Async>`, `<TableSkeleton>`, `<ErrorState>`, `<Pager>` — the shared states every table renders. |

### CORS and the dev proxy

The API sends **no CORS headers**, so a browser blocks direct calls from `localhost`
even though `curl` works fine. In dev, Vite proxies `/__api/*` to `VITE_API_BASE_URL`
so requests are same-origin. A **production build always calls the absolute URL**, so
the server must send CORS headers before deploying anywhere real. Set
`VITE_DEV_PROXY=false` once it does.

### Conventions the client mirrors

- **Money is integer cents** on the wire. `fromCents` / `moneyC` in `src/lib/fmt.js`
  convert once, at the boundary.
- **Unknown JSON fields are a 400.** `clean()` in `api.js` drops empty values rather
  than sending `""` or `[]`, but deliberately preserves `show_zeros: false` and
  `show_all_dates: false`, which are real values.
- **Refusals are per line, with a reason.** `approve` and `settle` return
  `refused` / `rejected` maps; the UI names the first reason instead of saying
  "some lines failed".
- **Facets come from the server** and are self-excluding, so ticking AZ never zeroes
  the other states in its own list.
- **The server owns tab membership.** A line moves between Pending / Ready / Records /
  On Hold by itself; the client never re-derives it.

### Wired vs. still on fixtures

Wired to the API: **Pipeline Overview**, **Pending Approval**, **Ready to Pay**,
**Payment Records**, **On Hold**, **Pay Statements**, **Exposure**, **Dealer Rates**,
**Sales Rep Rates**, and the sidebar badges.

Still on `src/data/dummy.js`, because **no endpoint exists yet**: Advances, Manual
Payments, Open Items, Tickets, Access, and the settings registry (Pay Schedule, Loan
Fees, Rep Pay Settings…). The Rate Cards page states this on screen rather than
rendering empty tables that would read as missing data.

## What is *not* here

The **commission engine**. In the real system every dollar is computed server-side by
`compute_lines_v4.py` and stored in `due_ledger.calc` — the browser only displays it.
That is deliberate: a figure recomputed client-side could drift from the approved
snapshot, and the whole approval chain depends on that number being stable. This port
keeps that boundary.
