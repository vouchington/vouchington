# Lightweight Exports

[Back to My API](README.md#lightweight-exports)

`GET /api/v1/my/export/rss-feeds` and `GET /api/v1/my/export/topics` are synchronous,
lightweight exports for bounded follow graphs. The runtime `user-import-export-config`
DynamicConfig field `sync_export_max_items` defaults to `1,000`; requests over the cap return
`413` with `SYNC_EXPORT_TOO_LARGE`. Over-cap responses do not enqueue account-data exports; these
endpoints only return the requested RSS feed or topic export when the configured synchronous cap
allows it.

Allowed exports stream database rows to the response in bounded cursor batches. API JSON responses
retain their `{ "results": [...] }` body contract. Topic file downloads use `download=1` and stream
the established top-level array schema. Every export response includes an attachment filename so
browser and native clients can transfer it directly to a file.
