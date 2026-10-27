# Deploy Back on Track

## Supabase

1. Create a Supabase project on the free plan. Retain the project database password in your own secret manager.
2. Run `supabase/migrations/202610270001_workspace.sql` in the project's SQL Editor. Alternatively use the Supabase CLI: `supabase link --project-ref YOUR_REF`, then `supabase db push` from the repository root.
3. Under Authentication → URL Configuration, set your exact production Site URL and add `http://localhost:5173` as an allowed development redirect. Add only preview URLs you actually trust.
4. Enable email sign-in. The application uses Supabase magic links; it never handles KIT credentials. Supabase's built-in email service has delivery restrictions and rate limits: for users outside your project team configure your own SMTP service. A free SMTP allowance is sufficient for small usage; no paid email API is required by the application. Verify delivery before enabling public signup. See [Supabase email auth](https://supabase.com/docs/guides/auth/auth-email) and [SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
5. Copy `.env.example` to `.env`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the project URL and public anon/publishable key. A secret/service-role key is never needed by the browser or extension.
6. Restart Vite. In Settings, send yourself a sign-in link. The signed-in account starts with its own local workspace. Export/import a guest backup if transferring existing guest work.
7. Upload a small course, load it from another browser signed into the same account, and verify a second account sees none of its rows. Check that saving an older revision produces a conflict rather than replacing the cloud state.

The migration defines courses, activity categories, learning items, import events, preferences and revisions. Composite foreign keys bind categories and items to both their owning course and user. RLS covers every private table, including inserts and owner-changing updates. RPC functions use the caller's identity and a fixed empty search path. Save operations lock the revision row, reject stale revisions, and replace the user's normalized data inside one transaction. SQL constraint failures roll back the entire operation.

`npm run test:database` runs the actual migration against PostgreSQL in PGlite with two roles/users. Supabase Auth/PostgREST/email are separate hosted components and still need a deployment smoke test. An optional two-account smoke test is included:

```sh
SUPABASE_TEST_URL=https://YOUR_PROJECT.supabase.co \
SUPABASE_TEST_ANON_KEY=YOUR_PUBLIC_KEY \
SUPABASE_TEST_A_EMAIL=first-test-account@example.com \
SUPABASE_TEST_A_PASSWORD=YOUR_TEST_PASSWORD \
SUPABASE_TEST_B_EMAIL=second-test-account@example.com \
SUPABASE_TEST_B_PASSWORD=YOUR_TEST_PASSWORD \
npm run test:supabase:live
```

Use two dedicated, confirmed test accounts with password sign-in enabled for this smoke test. It creates uniquely identified temporary courses and materials, checks isolation through the real Supabase SDK/PostgREST, and cleans up its own records. It does not replace either account's workspace. Do not put these credentials into committed files or CI logs.

## Cloudflare Pages

1. Push this repository to your GitHub account and connect it to a Cloudflare Pages project.
2. Set the repository root as the build root, **`npm run build`** as the build command, and **`apps/web/dist`** as the output directory. Set `NODE_VERSION=24`.
3. Add the two public `VITE_SUPABASE_*` variables to the production build environment. Environment values are embedded at build time; rebuild after changing them.
4. Set `BOT_APP_ORIGIN=https://YOUR-SITE.pages.dev` for builds that also produce your matching extension. Cloudflare hosts only the website output directory; download/build the extension locally with the same origin.
5. Deploy. Update Supabase's Site URL to the resulting exact HTTPS origin. For custom domains, rebuild the extension with that exact custom origin too.
6. Verify sign-in redirects, deep links (`/#course/...`), cloud save/load, mobile layout, JSON download/import, and extension communication on the deployed origin.

`_headers` supplies CSP, frame restrictions, referrer policy, and other static security headers. The CSP allows the standard `*.supabase.co` project domains; add your exact custom Supabase domain to `connect-src` if using one. No Cloudflare Functions or paid services are required. `_redirects` supplies SPA fallback. Builds can also be uploaded with Cloudflare's Direct Upload workflow. See [Cloudflare build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/).

## Extension configuration

```sh
BOT_APP_ORIGIN=https://YOUR-SITE.pages.dev npm run build
```

Load `apps/extension/dist` in `chrome://extensions` using **Load unpacked**. After rebuilding choose **Reload** on the extension card. The Chromium extension ID can change when loading from a different directory; use the popup's actual ID in the website.

The manifest restricts external messages to the configured hostname. The service worker additionally checks the **exact origin, including port**. The only permitted HTTP development origin is `http://localhost:5173`. `127.0.0.1:5173`, other localhost ports, other subdomains, and other origins are deliberately rejected. JSON exchange works when direct browser messaging is unavailable.

## Operational limits

The app imposes generous validation limits (500 courses, 100 categories per course, 10,000 items per course; JSON and cloud snapshots up to 5 MB). Local browser storage may fill before these limits; failed writes are reported and the previous saved state is retained. Keep JSON backups. A corrupted local workspace is left untouched until explicitly replaced from a valid backup.

Cloud saves replace the current user's normalized snapshot atomically; for large datasets this is intentionally conservative rather than a fine-grained collaboration service. Cloud changes are not pushed in real time. On conflicts, download a local backup, load the cloud version, reconcile, and save again. Do not edit the same local workspace in multiple tabs at once; cloud revision protection applies to cloud writes.

Supabase free projects may have inactivity, database, email, and bandwidth limits; Cloudflare also has free-plan build and hosting quotas. Monitor provider dashboards. No unconditional claim of unlimited free hosting or delivery is made.
