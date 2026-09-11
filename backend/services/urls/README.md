# URLs

## Acceptance Criteria

### Blocked Hostnames

Allow users to create URLs, even if hostnames are blocked.
The reason is we want to keep track of who created these URLs.
However, URLs with blocked hostnames should be filtered upstream (e.g. block a user from creating a discussion with this URL)

### URL Normalization

- URLs should be normalized before storage
- URL fragments should be stripped before storage; `urls.url` identifies fetchable resources, not document anchors
- Store hostname separately for efficient filtering
- Track URL metadata (domain, robots.txt compliance)

Multi-row hostname and URL upserts use their unique keys (`hostname`, then `url`) as canonical
write order. `addUrls` still returns results in the caller's first-normalized occurrence order.

### Pathname Length

URL pathnames are stored with a maximum length of 2048 characters, enforced by a PostgreSQL CHECK constraint. This accommodates long article slugs from RSS feeds. Note that the `url` column has a separate 2083-character CHECK, so very long hostnames or query strings can still push a URL over that limit independently.

### Content Types

URL content types are stored in the `url_content_types` lookup table and referenced by `urls.url_content_type_id`. The lookup id is a `BIGINT`, and `upsertUrlContentTypes()` reads by normalized MIME type before writing so existing lookups can use the read replica. Misses take an advisory transaction lock, re-check the primary, and insert only when still missing; this avoids `INSERT ... ON CONFLICT` sequence burn during repeated RSS/feed imports.

## Transactional Invalidation

`addUrl` / `addUrls` invalidate `urls_lookup` automatically after non-transactional writes. However, when called with a `queryOptions.client` (inside a DB transaction), the caller is responsible for calling `invalidate.urls(...urlStrings, ...urlIds)` after the transaction commits:

- Pass **URL strings** to evict `urls_lookup` entries (keyed by URL string).
- Pass **URL IDs** (UUIDs) to evict the `urls` entity cache (keyed by UUID). This matters when `addUrls` hits an `ON CONFLICT` update on an existing URL row.

Missing either form leaves the corresponding cache stale for up to the `urls_lookup` TTL (1 day) or `urls` entity TTL.

## Related

- Systems:
  - [../../queues/crawler/](../../queues/crawler/README.md) - URL crawling queue
  - [../../queues/urls-domains-blacklist/](../../queues/urls-domains-blacklist/README.md) - Blacklist checking queue
- URL Hostnames: [../urls-hostnames/README.md](../urls-hostnames/README.md)
- URL Domain Blacklist: [../urls-domains-blacklist/README.md](../urls-domains-blacklist/README.md)
- URL Domain Robots: [../urls-domains-robots/README.md](../urls-domains-robots/README.md)
- Parent: [../CLAUDE.md](../CLAUDE.md)
