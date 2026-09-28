# Crawls

Each crawl represents a crawl of a URL.

## Storage and cleanup

[`crawls`](../../data-stores/psql/schema-snapshot/markdown/tables/crawls.md) uses monthly `RANGE`
partitions on its UUIDv7 `id`; [`crawl_chunks`](../../data-stores/psql/schema-snapshot/markdown/tables/crawl_chunks.md)
uses monthly `RANGE` partitions on its owning `crawl_id`. The canonical partition inventory and
policy are in the [PostgreSQL Partitioning Strategy](../../../docs/overview/architecture/partitioning-strategy.md).

`cleanupPartitions` drops whole expired monthly partitions, with `crawl_chunks` dropped before
`crawls` because of their foreign-key dependency. Its configured 30-day retention is therefore not
an exact per-row cutoff: the effective retention window is approximately 30–61 days, depending on
the row's position in its month. It runs daily at 02:00 UTC.

`deleteOldInvalidCrawls` is separate direct-row cleanup. It deletes only crawls older than its
cutoff whose `network_error` is non-null or whose `completed_at` is null; it does not delete all
older crawl rows. It runs daily at 03:30 UTC.

## Acceptance Criteria

- A crawl is considered usable for search once embeddings are created.
- A crawl is considered usable for embedded content once the meta tags are created (e.g. to get the thumbnail image).
- For end users, we only ever look up the latest successful crawl for a URL.
- We rate limit requests per domain using `url_hostnames.requests_per_second_limit` and `Crawl-delay` from robots.txt (whichever is larger), capped at 60s maximum
- 429 domain locks in Valkey keep the longest remaining TTL when overlapping Retry-After values are recorded
- We do not crawl hostnames where `blocked = true` or `crawlable = false`
- Before crawling, we respect the domain's `robots.txt` with `@services/urls-domains-robots`
- Pages with `noindex` in `<meta name="robots">` or `X-Robots-Tag` header are stored but have empty markdown and no embeddings created
- The crawler uses `voucha-bot https://voucha.ai/article/voucha-bot` as User-Agent (`CRAWLER_USER_AGENT` from `@voucha/config`)
- Crawl HTTP requests use centralized undici dispatchers. SSRF-validated HTML fetches use pinned dispatchers derived from the resolved public IP set so connection reuse does not weaken DNS pinning.
- Batch HTML lookups spool decompressed S3 bodies sequentially to private operating-system temp files, skip missing, corrupt, or oversized bodies per page, and transfer cleanup ownership to the boilerplate worker.
- Raw crawl HTML snapshots in S3 are 7-day ephemeral inputs for boilerplate extraction; parsed crawl rows and crawl history keep the existing database retention policy.
- Snapshot PUTs are hash-keyed by `hostname/urlId/htmlSha256`; unchanged pages reuse the existing object only while `html_snapshot_uploaded_at` is inside the 7-day S3 lifecycle window. Expired snapshots are refreshed with a new PUT so boilerplate extraction never points at lifecycle-deleted objects.
- Snapshot uploads gzip the HTML to a private temp file, open that file before `PutObject`, and close the handle before deleting the temp directory, including when S3 `send` never reads the body.
- Conditional request metadata (`ETag`, `Last-Modified`) is sent only while the previous HTML snapshot is reusable; stale snapshots force a full-body fetch so the S3 object can be recreated.

Triggered Crawls:

- Crawls are triggered by manual intervention
- Crawls are triggered when URLs are added via entity relation

Scheduled Crawls:

- Daily crawl dispatcher - a daily job that dispatches a hostname crawl dispatcher per hostname
- Daily hostname crawl dispatcher - a dispatcher that schedules crawls for all URLs whose last crawl is `> url_hostnames.age_threshold_days` while respecting the rate limit (e.g. if the hostname's rate limit is 1 per second, schedule each crawl with a 1 second delay in between)

Crawling:

- Fetch the previous successful's `etag` and `last_modified_at` headers and set them in the new crawl for caching
- Currently, we only need to handle HTML responses
- Crawl stores `lang` from `<html lang="...">`, `title`, `meta_tags`, `links`, `markdown`, and
  nullable normalized `embed_metadata`, plus the crawl-local `embed_oembed_url` candidate and its
  optional `embed_oembed_resolved_at` completion timestamp.
- Embed metadata contains normalized provider, author, thumbnail, and authorized player fields;
  raw oEmbed HTML is not stored. YouTube and Vimeo use explicit endpoints; PeerTube endpoints and
  players are limited to the already-crawled instance and expected paths.
- Local extraction is attached to the crawl that supplied its HTML. Optional remote oEmbed
  enrichment is recorded against that same crawl; URL presentation reads only the selected crawl's
  metadata and never copies metadata from another crawl.
- Canonical URL is derived from `<link rel="canonical">`, resolved to an absolute URL. `og:url` mismatches are logged as diagnostics only.
- After a successful crawl (e.g. 200 status code and meta tags are generated), we create embeddings for the content, which then creates `crawl_chunks`.
- `crawl_chunks` are split by `@services/ai-chunking` and are stored in order `order_index ASC`.
- Once these embeddings are created, `embeddings_generated_at` is set for the crawl.
- Embeddings can be re-used if there is already an embedding in our system for that content sha256
- Any missing crawl-chunk embeddings, whether one or many, use the Bedrock batch pipeline.
- Once embeddings for a crawl is created, we can delete all crawl chunks created before this crawl for that URL.

Cleanup:

- Partition cleanup retains crawl history for approximately 30–61 days; see [Storage and
  cleanup](#storage-and-cleanup).
- Direct-row cleanup deletes only older incomplete or network-error crawls.

## Error Recording

Each error type records different fields in the crawl row on failure:

| Error class                        | `response_status_code`    | `network_error` |
| ---------------------------------- | ------------------------- | --------------- |
| `CrawlerTimeoutError`              | 504                       | `'timeout'`     |
| `CrawlerNetworkError` (DNS cause)  | 502                       | `'dns'`         |
| `CrawlerNetworkError` (other)      | 502                       | `null`          |
| `CrawlerRateLimitError`            | 429                       | `null`          |
| `CrawlerServerError`               | 5xx (actual)              | `null`          |
| `CrawlerResponseSizeExceededError` | 413                       | `null`          |
| `CrawlerHttpClientError`           | 4xx (actual)              | `null`          |
| `CrawlerSsrfError`                 | 403                       | `'ssrf'`        |
| `HttpNoBodyError`                  | 502                       | `null`          |
| Unknown error                      | 200 (seeded, not updated) | `null`          |

## Embeddings Workflow

Given a page with valid results (markdown, meta tags, links, title, etc.), crawl chunks use Amazon
Nova 2 Multimodal Embeddings V1 through the
[Bedrock embeddings pipeline](../../../docs/overview/architecture/bedrock-embeddings.md):

- Create the chunks using `@services/ai-chunking`
- In a single SQL query, find any existing embeddings that corresponds to those chunks' content hashes
- In a single SQL query, insert all embeddings into the database.
  - If we do not find an existing embedding for that chunk, insert it with no embeddings
  - If we find an existing embedding for that chunk, insert it with those embeddings
- If there are no additional embeddings to calculate, set `embeddings_generated_at` for that crawl. We are done.
- If any chunks without embeddings remain, whether one chunk or many, the Bedrock batch creation
  dispatcher is their sole embedding path and includes them once the configured minimum batch size
  is available.
- Batch polling saves new embeddings into each `crawl_chunks` row. After confirming that all chunks
  for the current URL crawl have embeddings, it sets `embeddings_generated_at`.

## Related

- [Crawling Overview](../../../docs/overview/architecture/crawling.md)
- [Crawler System](../../queues/crawler/README.md)
- [URLs Domains Robots Service](../urls-domains-robots/README.md)
