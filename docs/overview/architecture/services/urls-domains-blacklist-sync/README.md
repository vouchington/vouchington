# URL Domains Blacklist Sync Service

Source entrypoint: [backend/services/urls-domains-blacklist-sync/README.md](../../../../../backend/services/urls-domains-blacklist-sync/README.md)

Downloads a blacklist source, diffs it against the domains already stored for that source, and
writes the added/removed domains. Split out of
[`@services/urls-domains-blacklist`](../urls-domains-blacklist/README.md) so that
[`pg-copy-streams`](https://www.npmjs.com/package/pg-copy-streams) is only pulled in by the worker
that actually runs syncs, not by every consumer of the base lookup/check service (e.g.
`@services/web-risk`).

## Flow

1. Stream the downloaded domains into temporary PostgreSQL staging tables with `pg-copy-streams`.
2. Build the added/removed diff completely before opening a transaction.
3. Apply only the set-based insert/delete diff inside a pinned-client transaction.
4. Enqueue affected hostname IDs for durable cache invalidation in that transaction, including
   removed domains. Commit, then run one bounded invalidation pass before dropping staging tables.
5. A scheduled sweep resumes work after cache or process failures; Bloom rebuilding remains separate.

The database projects each domain diff into hostname block history and updates URL crawl policy
once per statement, including bulk syncs. Changing a configured source between URL and email
reclassifies its active projected blocks in the same transaction; email blocks do not block URL
crawls.
When a sync first creates a hostname below an independently blocked parent, it also records the
inherited parent block. Removing the feed entry then leaves the administrator's parent policy in
effect for that hostname.

## Public Helpers

- `syncBlacklistSource(sourceId, url, sourceType?, dependencies?)` — fetches the source (with
  conditional `ETag`/`Last-Modified` headers), diffs it against the DB, and returns
  `{ skipped, domainsAdded, domainsRemoved }`.
- `syncBlacklistSourceById(sourceId, dependencies?)` — looks up the source by id and syncs it,
  reporting failures via `onError` instead of throwing.
- `syncDomainsWithDatabase(sourceId, response, sourceType?)` — stages the downloaded domain list
  via `pg-copy-streams`, applies a short transactional diff to `blocklisted_domains`, releases the
  database client, and then schedules the affected Bloom filter rebuild.
- `createBlacklistFetchHeaders(cache)` — builds conditional request headers from stored cache
  metadata.

## Related

- Lookup/check service and Bloom filters: [../urls-domains-blacklist/README.md](../urls-domains-blacklist/README.md)
- Worker: [../../workers/urls-domains-blacklist/README.md](../../queues/workers/urls-domains-blacklist/README.md)
