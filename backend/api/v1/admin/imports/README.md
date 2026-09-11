# Admin Imports API

Batch import endpoints for creating and updating topics and CRM contacts via CSV. Uses a validate-then-enqueue pattern: rows are validated first, and the batch is only created if all rows pass validation.

## Endpoints

### POST /api/v1/imports/topics

Batch create/update topics via the import queue. Accepts a CSV body. Upserts by slug.

**Auth:** Administrator only

**Content-Type:** `text/csv`

**Request body (CSV):**

```csv
slug,name,topic_type,markdown,rss_feed_url,rss_feed_title
my-topic,My Topic,topic,Description here.,https://example.com/feed.xml,Example Feed
another-topic,Another Topic,card,,,
```

Recognized columns:

| Column           | Required | Notes                                                |
| ---------------- | -------- | ---------------------------------------------------- |
| `slug`           | Yes      | Upsert key. Lowercase letters, digits, hyphens only. |
| `name`           | No       | Defaults to slug on create. Max 200 chars.           |
| `topic_type`     | No       | Valid enum if provided.                              |
| `markdown`       | No       |                                                      |
| `rss_feed_url`   | No       | Valid URL. Requires `rss_feed_title`.                |
| `rss_feed_title` | No       | Required if `rss_feed_url` present.                  |

Unknown columns cause a 422 error (prevents silent typos).

**Responses:**

- `201` — All rows valid; batch created and jobs enqueued
  ```json
  { "valid": true, "batch": { "id": "...", "import_type": "topic", "total_rows": 2 } }
  ```
- `400` — Empty body, header-only CSV, malformed CSV, or exceeds 1000 rows
- `422` — Unknown columns or invalid rows:
  ```json
  { "valid": false, "error": "Unknown CSV columns: typo_field" }
  ```
  or
  ```json
  {
    "valid": false,
    "validation": {
      "valid": false,
      "rows": [{ "row_index": 0, "valid": false, "errors": ["slug is required"] }]
    }
  }
  ```

---

CRM contact imports use the service-level present-column semantics documented in
[Admin Imports Service § CRM Contacts](../../../../services/admin-imports/reference-upsert-semantics.md#crm-contacts).

### GET /api/v1/imports/:batchId

Get status, rows, and progress for an import batch.

**Auth:** Administrator only

**Response (streamed JSON):**

```json
{
  "batch": { "id": "...", "import_type": "topic", "total_rows": 10, "completed_rows": 7, ... },
  "rows": [ { "id": "...", "row_index": 0, "completed_at": "...", ... } ],
  "progress": { "total": 10, "completed": 7, "failed": 1, "pending": 2 }
}
```

**Responses:**

- `200` — Batch found; streams batch + rows + progress
- `400` — Invalid UUID
- `404` — Batch not found

## Common Error Responses

- `401` — Unauthorized
- `403` — Not an administrator

## Performance

| Endpoint                          | Round Trips | Caching      | Notes                                                         |
| --------------------------------- | ----------- | ------------ | ------------------------------------------------------------- |
| POST /api/v1/imports/topics       | 3           | None (write) | Auth, validate (sync), create batch + enqueue jobs            |
| POST /api/v1/imports/crm-contacts | 3           | None (write) | Auth, validate (sync), create batch + enqueue jobs            |
| GET /api/v1/imports/:batchId      | 2           | None         | Auth + batch lookup, then parallel streaming (rows, progress) |

## Related

- Service: [../../../../services/admin-imports/README.md](../../../../services/admin-imports/README.md)
- Job system: [../../../../queues/admin-imports/](../../../../queues/admin-imports/)
