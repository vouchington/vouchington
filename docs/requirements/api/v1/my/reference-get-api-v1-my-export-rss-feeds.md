# GET /api/v1/my/export/rss-feeds

[Back to My API](README.md#get-apiv1myexportrss-feeds)

Query parameters:

- `format` — `json` or `csv`; omitted or any other value returns OPML XML
- `feed_type` — filter by feed type (e.g. `article`, `podcast`, `video`)

**CSV format** (`?format=csv`) returns `Content-Type: text/csv; charset=utf-8` with a header row and columns:

```
title,url,feed_type,home_page_url,topic
```

The `url` column is the RSS feed URL — this is the column recognized by the importer for round-trip.

All formats return an attachment response and stream rows without materializing the complete export.
