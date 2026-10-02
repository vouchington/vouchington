# User RSS Feed Imports System

Source entrypoint: [backend/queues/user-rss-feed-imports/README.md](../../../../../backend/queues/user-rss-feed-imports/README.md)

Processes user-submitted RSS feed import batches outside the API request path.

## Architecture

The user import API stores one `user_rss_feed_import_batches` row and one
`user_rss_feed_import_rows` row per submitted URL, then enqueues one small job per row via
`enqueueBulkUserRssFeedImportRows()`. Jobs carry only `{ importId, rowId }`; the worker reloads
the row and records the terminal per-row outcome. The batch row also stores the submitting
request's content provenance (`created_via` and `created_via_oauth_client_id`), so every feed the
job creates records the channel and OAuth client that submitted the import rather than `system`.
See [content provenance](../../../../requirements/content/content-provenance.md).

## Queue Reference

| Queue                   | Processor          | Group Keys | Default Priority | Description                 |
| ----------------------- | ------------------ | ---------- | ---------------- | --------------------------- |
| `user-rss-feed-imports` | `processImportRow` | none       | 10               | Process one user import URL |

## Related

- Service: [../../services/user-import-export/README.md](../../services/user-import-export/README.md)
- Parent: [../AGENTS.md](../../../../../backend/queues/AGENTS.md)
