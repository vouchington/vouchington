# Row Processor

[Back to Admin Imports Service](README.md#row-processor)

| Type          | Processor                     | Description                                        |
| ------------- | ----------------------------- | -------------------------------------------------- |
| `topic`       | `process-topic-row.mts`       | Upserts topic by slug; optionally creates RSS feed |
| `crm_contact` | `process-crm-contact-row.mts` | Upserts CRM contact by email                       |
| `rss_feed`    | `process-rss-feed-row.mts`    | Upserts RSS feed import rows                       |

Processors are idempotent: rows already marked `completed_at` are skipped. Failed rows are re-processed on retry.
