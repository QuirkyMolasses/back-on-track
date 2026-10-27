# KIT ILIAS adapter: evidence and first real import

## What was investigated

The public [KIT ILIAS repository](https://ilias.studium.kit.edu/) was accessed without credentials on 2026-10-27. It identified itself as ILIAS 10.12 and exposed these observed navigation formats:

- `https://ilias.studium.kit.edu/goto.php/crs/2613907`
- `https://ilias.studium.kit.edu/goto.php/cat/256486`
- `https://ilias.studium.kit.edu/goto.php/file/2917062`
- legacy `goto.php?target=cat_...&client_id=produktiv`
- repository links containing `ilias.php?baseClass=ilrepositorygui&ref_id=...`

The public list used `ilContainerListItem` and `il_ContainerItemTitle` classes. The minimal retained fixture, `tests/fixtures/kit-public-2026-10-27.html`, records public text and links only. The [official ILIAS source repository](https://github.com/ILIAS-eLearning/ILIAS) was also reviewed. Availability of an authorized KIT REST interface for ordinary student accounts was **not established**. No API endpoints are assumed or probed by this implementation.

The adapter centralizes selectors and link conventions in `packages/ilias/src/index.ts`. Synthetic course and legacy-folder fixtures exercise common structures, nested relationships, sanitized URLs, duplicate IDs, explicit upload labels, missing/invalid dates, and login states. **These fixtures do not prove that KIT's authenticated course pages currently use these layouts.**

## First live import

1. Build/load the extension following the README. Use the website origin embedded in that build.
2. Log into ILIAS normally in the browser. Open a course you legitimately have permission to access.
3. Click the Back on Track toolbar icon and choose **Aktuelle ILIAS-Seite lesen** without recursive reading first.
4. Inspect the count and diagnostics. Export the JSON and review titles, canonical source URLs, course IDs, and upload dates. It should contain no credentials, HTML, cookies, request headers, or session query parameters.
5. In Back on Track → Import & Backup, use the popup's extension ID and **Sync von ILIAS**, or open its JSON file. Choose an existing course manually when the detected course context is wrong or unknown. Approve the import.
6. Open the course. Edit material titles, categories, weights, relevance and upload dates as needed. Open each source link and compare it with the original material. Unknown timestamps must remain empty until you verify them yourself.
7. Mark an item partly complete, rename its category, change its weight, and override relevance/date. Re-import the same source. Confirm that all your edits survive and no duplicate learning item appears.
8. Repeat with **Verlinkte Kurse und Unterordner lesen** enabled. Compare the imported nested-folder contents with the browser. The crawler follows observed same-origin course/folder links only, up to 50 pages and 5 levels; access errors and traversal limits produce diagnostics.
9. Test on a course with an administrative document and a new lecture upload. Mark the administrative document irrelevant. In Stay on Track mode, only the latest relevant dated material should set the single course deadline.
10. Download a backup and optionally save the approved state to Supabase from the website. The extension never receives the Supabase session.

## Fallback and correction

The current-page workflow requires only `activeTab`, `scripting`, and local extension storage. No persistent host permissions are requested. If recursive traversal fails, open the folder yourself in the normal ILIAS tab and import just that page. Link it to the intended Back on Track course during review. Source IDs deduplicate materials even when imported through different folder pages into the same course.

Only explicit **Hochgeladen / Upload / Uploaded on** calendar dates are parsed. Generic dates, modification dates, and object creation dates are not treated as reliable file upload dates. Folder names become suggested categories for nested materials. Missing metadata is exposed for manual correction; it is never replaced with today's date.

The crawler does not download material binaries or submit forms. It performs bounded same-origin GET requests from the content script using the browser's existing session. Cookies participate in normal browser authentication but are never read or copied into the payload. Redirects to login or external SSO are rejected. If an authenticated login page is returned, scanning stops for that page and reports a warning.

Pagination, lazily loaded materials, expanded accordions, protected subfolders, and instance-specific learning modules may need manual navigation or adapter updates after live verification. The adapter imports linked files, exercises, learning modules, SCORM/HTML modules and tests; it does not claim to extract internal tasks from every ILIAS object type. A generic `ref_id` alone is not enough to guess a material type; recognized icon hints or typed links are required. Current-page fallback retains a sanitized repository reference when one is available.

If the markup differs, collect a **sanitized** minimal DOM example yourself (remove names, grades, email addresses, forms, tokens, scripts and session values), add it as an explicitly labeled fixture, then update this one adapter and its tests. Never commit authenticated page dumps.
