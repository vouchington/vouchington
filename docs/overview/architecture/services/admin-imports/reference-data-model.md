# Data Model

[Back to Admin Imports Service](README.md#data-model)

### `admin_import_batches`

| Column           | Type                  | Description                          |
| ---------------- | --------------------- | ------------------------------------ |
| `id`             | UUID (UUIDv7)         | Primary key                          |
| `import_type`    | `admin_import_types`  | `topic`, `rss_feed`                  |
| `created_by_id`  | UUID → `users`        | Admin who initiated the import       |
| `total_rows`     | INT                   | Number of rows in the batch (1–1000) |
| `completed_rows` | INT                   | Rows successfully processed          |
| `failed_rows`    | INT                   | Rows that failed processing          |
| `completed_at`   | TIMESTAMPTZ           | Set when all rows are finished       |
| `metadata`       | JSONB                 | Optional extra context               |
| `created_at`     | TIMESTAMPTZ (virtual) | Derived from UUIDv7 timestamp        |
| `updated_at`     | TIMESTAMPTZ           | Updated on every row status change   |

### `admin_import_rows`

| Column          | Type          | Description                                     |
| --------------- | ------------- | ----------------------------------------------- |
| `id`            | UUID (UUIDv7) | Primary key                                     |
| `batch_id`      | UUID          | Parent batch                                    |
| `row_index`     | INT           | Zero-based position within the batch            |
| `input_data`    | JSONB         | The raw input row as submitted                  |
| `topic_id`      | UUID          | Concrete topic target (set for topic imports)   |
| `rss_feed_id`   | UUID          | Concrete RSS feed target (set for feed imports) |
| `completed_at`  | TIMESTAMPTZ   | Set when row processing succeeds                |
| `failed_at`     | TIMESTAMPTZ   | Set when row processing fails                   |
| `error_message` | TEXT          | Error description (set on failure)              |
| `created_at`    | TIMESTAMPTZ   | Derived from UUIDv7 timestamp                   |
| `updated_at`    | TIMESTAMPTZ   | Updated on row completion or failure            |

Rows may be retried while pending, including after a recorded intermediate error. Once a row
records `completed_at` or `failed_at`, PostgreSQL keeps that result terminal and the batch counters
cannot claim completion until every row has a terminal result.

Service responses continue to expose `created_entity_id`, derived from the one concrete target
column, so the API contract does not expose the storage change.
Completed rows must keep exactly one target matching their batch type. Target deletion is
restricted so the import audit and batch counters cannot be invalidated after completion.
