# Back on Track

A free academic progress tracker, initially built for KIT students. React 19, TypeScript, Vite, Supabase, and a Chromium Manifest V3 extension. German by default, with English localization and light/dark themes. No accounts or credentials are required for local use.

## Run

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open **http://localhost:5173** (use this exact hostname for extension communication). Start with an empty workspace: create a course, choose dates, create your own activity categories and weights, and add materials. No sample data is presented as real work. Data is saved in this browser after each valid change.

Optional cloud configuration: copy `.env.example` to `.env`, provide your Supabase URL and **public anon/publishable key**, and apply the database migration. Never put a service-role or secret key in any `VITE_` variable. See [deployment instructions](docs/deployment.md).

## Verification

```sh
npm run check          # strict TypeScript, ESLint, Prettier, Vitest, production builds
npm run test:database  # real PostgreSQL migration / RLS / atomicity tests in PGlite
npx playwright install chromium
npm run test:e2e       # desktop, mobile, and the actual built MV3 extension
npm audit --audit-level=high
```

`npm run test:e2e` expects an extension build from `npm run build` and the default localhost origin. CI runs the whole sequence and uploads build artifacts. Parser fixtures are explicitly labeled as public observations or synthetic authenticated-layout examples.

## Build and install the extension

```sh
npm run build
```

- Website: `apps/web/dist` — deploy this directory to Cloudflare Pages.
- Extension: `apps/extension/dist` — open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this directory.
- For a deployed website, run `BOT_APP_ORIGIN=https://YOUR-SITE.pages.dev npm run build` and reload the extension. An exact HTTPS origin is required; wildcard domains and preview subdomains are intentionally excluded. `.env` is read by Vite; `BOT_APP_ORIGIN` must be provided to the build command as shown.

Open an authenticated KIT ILIAS course, click the extension, and choose **Aktuelle ILIAS-Seite lesen**. Optionally include linked courses and folders. In the website, open **Import & Backup**, enter the extension ID shown in the popup, and choose **Sync von ILIAS**. Review course mappings and approve the import. Alternatively export JSON in the popup and open that file on the website.

New materials default to **irrelevant** until a classification rule matches or you explicitly mark them relevant. Unknown upload dates remain empty. Review them before relying on Stay on Track calculations. See the [first live import and verification guide](docs/ilias-verification.md).

## How progress works

All calculations are pure functions in `packages/domain`; future Android/iOS clients can reuse the package without React or browser dependencies. Dates represent calendar dates in **Europe/Berlin**. UTC day numbers implement day arithmetic, so daylight-saving changes never create fractional-day drift.

```text
actual   = Σ(relevant item weight × completion) / Σ(relevant item weight)
expected = clamp((today − start) / (deadline − start), 0, 1)
days Δ   = (actual − expected) × (deadline − start)
```

Item weights inherit their category's weight unless overridden, including a valid override of zero. Only known relevant materials contribute. Exam deadline = exam date minus buffer days. Stay on Track has **one course deadline** = latest known relevant upload date plus a configurable offset (default 7 days).

Empty or zero-weight workloads have no invented completion percentage. Missing dates and non-positive intervals have explicit states. Before the start, no day delta is reported. The deadline date is the last planning day; afterward unfinished work is **overdue**, with the original deadline and overdue day count retained. Completed work stays completed. Partially known upload dates produce a provisional-deadline warning. The detail view exposes the actual inputs and formula.

## Structure

| Directory         | Responsibility                                                                      |
| ----------------- | ----------------------------------------------------------------------------------- |
| `packages/domain` | Schemas, calendar dates, calculation engine, classification, import merge, protocol |
| `packages/ilias`  | Isolated DOM adapter and URL parser, snapshot normalization                         |
| `apps/web`        | Responsive UI, local persistence, Supabase auth and versioned cloud sync            |
| `apps/extension`  | User-triggered browser-session extraction, bounded folder traversal, local exchange |
| `supabase`        | Normalized PostgreSQL schema, RLS policies, atomic revision-checked RPCs            |
| `tests`           | Calculation, import, parser, UI, SDK, database, and browser tests                   |

Cloud sync is explicit: **In Cloud speichern** and **Cloud laden**. It uses revision checks to reject overwriting concurrent cloud changes. Local guest and authenticated account workspaces are separate. To move guest data into an account, export a guest backup, sign in, import that backup, then upload it. Local data is not uploaded just because you sign in. Backups and cloud download require a visible replacement confirmation.

Imports never remove missing source items and never overwrite completion, custom weights, category assignments, renamed categories, or explicit title/relevance/date overrides. Source metadata remains separate from editable fields. Repeat imports reuse stable source IDs. JSON imports are size-limited and schema-validated; source URLs are canonical, same-origin KIT links. React renders imported text without interpreting HTML.

## Deployment and remaining verification

See [deployment](docs/deployment.md), [ILIAS verification](docs/ilias-verification.md), and [protocol/security](docs/security.md). The project can run within Cloudflare Pages and Supabase free-tier quotas and uses no paid APIs. Provider quotas and email configuration still apply.

Public KIT links were inspected; authenticated course layouts, pagination, and timestamp labels require your real-browser verification. A KIT REST API available to ordinary students was **not established**; the implementation uses your authorized browser session and observed links. No KIT passwords, session cookies, or authentication tokens are exported to the website or Supabase.
