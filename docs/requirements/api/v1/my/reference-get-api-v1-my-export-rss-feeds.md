# GET /api/v1/my/export/rss-feeds

[Back to My API](README.md#get-apiv1myexportrss-feeds)

Query parameters:

- `format` — `json`, `csv` or `opml`; omitted returns OPML XML. Any other value, or a repeated
  `format`, answers `422` before the export runs (see
  [request validation](reference-request-validation.md#query-carriers))
- `preflight` — `1` answers `204` without a body when the export fits the synchronous limit. Any
  other value, or a repeated `preflight`, answers `422`
- `feed_type` — filter by feed type: `article`, `podcast`, `video`, or `mixed` (lowercase); an empty
  value means no filter. Any other value, or a repeated `feed_type`, answers `422` before the export
  runs, with no `Content-Disposition` header (see
  [request validation](reference-request-validation.md#query-carriers))

**CSV format** (`?format=csv`) returns `Content-Type: text/csv; charset=utf-8` with a header row and columns:

```
title,url,feed_type,home_page_url,topic
```

The `url` column is the RSS feed URL — this is the column recognized by the importer for round-trip.

All formats return an attachment response and stream rows without materializing the complete export.
