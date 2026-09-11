# @services/web-search

Full-text search over crawled pages and URL-string matching.

## What it does

`searchWeb(options)` runs a single PostgreSQL query with four CTEs:

1. **`content`** — FTS match against `crawl_chunks.search_vector`, deduped to one chunk per URL (best rank)
2. **`url_match`** — `ILIKE` match on `urls.url`, excluding URLs already in `content`
3. **`merged`** — union of both branches, ordered by rank (content first, then URL matches)
4. Final select — joins `view_urls` and calls `ts_headline()` to produce highlighted snippets

## Tables queried

- `crawl_chunks` — full-text search vector
- `crawls` — freshness/validity filter
- `urls` — URL-string filter and result enrichment
- `url_hostnames` — blocked/crawlable gate
- `view_urls` — public URL view (includes hostname JSON)

## Notes

The hostname/crawl filter conditions mirror `buildValidCrawlChunksFilter()` from
`@services/crawls/tools/filters.mts`. They are inlined here because the conditions must live
inside the `content` CTE rather than appended as a separate SQL fragment.

The `content` CTE picks the best-ranked chunk across all valid crawls for each URL in the
trailing 30 days, not necessarily the chunk from the most recent crawl. A URL crawled multiple
times may produce a snippet from an older revision if that revision ranked higher for the query.
This is a known v1 trade-off: "best-ever match in 30 days" vs. "current content".
