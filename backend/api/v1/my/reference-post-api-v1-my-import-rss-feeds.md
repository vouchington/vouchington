# POST /api/v1/my/import/rss-feeds

[Back to My API](README.md#post-apiv1myimportrss-feeds)

Accepts a JSON (`application/json`) body with one of these fields (in priority order):

- `opml` (string) — OPML XML string; extracts `xmlUrl` from all outlines
- `csv` (string) — CSV string with a header row; the `url`, `xmlUrl`, or `rss_feed_url` column is extracted (falls back to treating each line as a URL when no such column is found)
- `urls` (array of strings) — list of feed URLs

Non-JSON request bodies are rejected with `415`; the API is JSON-only as a CSRF defense (see [CSRF Protection](../../../../docs/requirements/security/CSRF.md)). Round-trip: exporting with `?format=csv` and re-importing the CSV via `{ csv: "..." }` extracts the same feed URLs.

The encoded JSON body is limited to 2 MiB and an import may resolve to at most 500 URLs. User-facing
web and native clients submit `follow: true`. The response identifies the asynchronous import batch;
clients observe progress through the owner-scoped status endpoint. Stopping a client poller does not
cancel queued server work. See [Sources and Domains: Import/Export](../../../../docs/requirements/content/SOURCES-DOMAINS.md#importexport).
