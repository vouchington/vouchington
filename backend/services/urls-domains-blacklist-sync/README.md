# URL Domains Blacklist Sync Service

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
4. Drop staging tables and release the writer client.
5. Enqueue a separate URL or email Bloom-filter rebuild job after commit.

## Public Helpers

- `syncBlacklistSource(sourceId, url, sourceType?, dependencies?)` — fetches the source (with
  conditional `ETag`/`Last-Modified` headers), diffs it against the DB, and returns
  `{ skipped, domainsAdded, domainsRemoved }`.
- `syncBlacklistSourceById(sourceId, dependencies?)` — looks up the source by id and syncs it,
  reporting failures via `onError` instead of throwing.
- `syncDomainsWithDatabase(sourceId, response, sourceType?)` — stages the downloaded domain list
  via `pg-copy-streams`, applies a short transactional diff to `domain_blacklists`, releases the
  database client, and then schedules the affected Bloom filter rebuild.
- `createBlacklistFetchHeaders(cache)` — builds conditional request headers from stored cache
  metadata.

## Related

- Lookup/check service and Bloom filters: [../urls-domains-blacklist/README.md](../urls-domains-blacklist/README.md)
- Worker: [../../workers/urls-domains-blacklist/README.md](../../workers/urls-domains-blacklist/README.md)
