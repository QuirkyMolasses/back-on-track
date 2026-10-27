# Import protocol and security boundaries

## Version 1

The framework-independent Zod schemas in `packages/domain/src/protocol.ts` define the authoritative wire format:

```json
{
  "kind": "back-on-track/ilias",
  "version": 1,
  "exportedAt": "2026-10-27T10:00:00.000Z",
  "courses": [
    {
      "id": "kit:crs:123",
      "title": "Course title",
      "url": "https://ilias.studium.kit.edu/goto.php/crs/123",
      "items": [
        {
          "id": "kit:file:456",
          "title": "Material title",
          "url": "https://ilias.studium.kit.edu/goto.php/file/456",
          "category": null,
          "uploadedOn": null
        }
      ]
    }
  ],
  "diagnostics": []
}
```

Dates are ISO calendar dates interpreted in Europe/Berlin; `exportedAt` is a UTC instant. Unknown upload dates are `null`. Source IDs identify source objects, while locally generated UUIDs identify user records. Same-course source IDs deduplicate repeated imports. Duplicate course IDs, unsupported versions, unknown fields, off-origin URLs, query-string secrets, malformed dates and oversized files are rejected. Duplicate item source IDs are skipped with diagnostics. The adapter canonicalizes supported links before exporting them. A generic current-page reference uses only the observed repository handler and numeric `ref_id`.

## Local extension → website exchange

1. The user explicitly reads an ILIAS page with the extension. Only the normalized import payload is saved to `chrome.storage.local` as `pending`.
2. The user supplies the installed extension ID to the website and clicks **Sync von ILIAS**.
3. The website calls `chrome.runtime.sendMessage(extensionId, {kind: 'back-on-track/request', version: 1, nonce})` with a new UUID nonce.
4. `externally_connectable` restricts eligible websites to the configured hostname. The background listener additionally requires both `sender.origin` and `sender.url` to have the configured **exact origin**, including port. It checks message kind, version and nonce format, and validates the stored payload before responding.
5. The response kind is `back-on-track/response`, with matching version, nonce and payload. Errors use `back-on-track/error`. The website validates again and shows a review dialog. No course state changes until **Import freigeben** is clicked.
6. The website merges source metadata into its own workspace. Supabase authentication and cloud writes remain entirely in the website. The extension cannot sign in, load private course progress or save to Supabase.

The request returns a copy of the pending payload so retries remain safe; imports are idempotent. It does not consume/delete source data. The popup has an explicit local-data deletion control. Manual JSON export/import uses the same schema and review workflow. There is no `window.postMessage` bridge, arbitrary URL navigation command, unrestricted CORS proxy, remote extension code, or external analytics.

## User data

Progress, custom weights, and course settings always remain under user control. Existing item category assignments survive imports, including renamed categories. Explicit title/date/relevance edits set override flags, so future imports refresh raw `source` metadata without changing the user's chosen values. An absent upload date on a subsequent scan does not erase a previously known date. Missing source items are retained for review instead of being deleted.

Backups contain private learning data and source titles/URLs. They contain no Supabase authentication tokens. Browser-local data is not encrypted; treat browser-profile access like access to the student's private notes. Guest and signed-in account workspaces use separate storage keys. Signing out switches back to the guest workspace; it does not delete a signed-in account's local data from that browser profile.

RLS and composite foreign keys isolate cloud rows. The browser uses only a public project key. Cloud snapshot saves use optimistic revision checks and transactions; failures cannot leave half-imported state. All imported text is rendered through React text nodes. File size limits and strict schemas bound incoming data. Production static headers restrict scripts and connections. No third-party font or image requests are needed.
