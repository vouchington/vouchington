# language-detection queue

Detects the language of text content for all text-bearing entities and stores
the raw detection results in JSONB alongside the top-ranked ISO 639-1 code.

## Queue

**Name:** `language_detection`  
**Placement:** CPU-only (`worker-cpu`)  
**Deduplication:** debounce per entity ID (60s TTL)

Entity enqueues go through the shared GlideMQ enqueue helper, so intentional
fire-and-forget callers still get transient enqueue retry and rejected-promise
reporting through `onError`. Callers reconciling multiple entities use
`enqueueBulkLanguageDetection`, which submits one `addBulk` request while retaining
the same per-entity job name, payload, priority, retry, and deduplication options.

## Job names

| Job name        | Trigger                   | Description                                            |
| --------------- | ------------------------- | ------------------------------------------------------ |
| `post`          | Post created/updated      | Detect language of post title + markdown               |
| `rss_feed_item` | RSS item ingested         | Detect language (uses feed `declared_language` first)  |
| `crawl`         | Crawl updated             | Detect language (uses `lang` from `<html lang>` first) |
| `community`     | Community created/updated | Detect language of community markdown                  |
| `user`          | User bio updated          | Detect language of user bio                            |
| `topic`         | Topic created/updated     | Detect language of topic name + markdown               |
| `backfill_*`    | Admin trigger             | Backfill detection for entities with no result yet     |

## Backfill

Six backfill dispatcher jobs (one per entity type) are registered in
`BACKFILL_REGISTRY` and triggered from the admin `/admin/queues` page.
Each dispatcher streams IDs via pg-cursor and runs batch detection directly
(`detectLanguageMany`) instead of enqueueing individual jobs, avoiding queue
overhead for large backfill operations.
