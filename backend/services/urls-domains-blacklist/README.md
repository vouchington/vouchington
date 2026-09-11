# URL Domains Blacklist

## Goals:

- Avoid IOPS and writes to the writer endpoint.

## Acceptance

This holds the blacklist source registry, domain lookup checks, and the Bloom filter
warmup/mutation helpers. We keep track of hostnames.

- `isUrlBlocked()` checks a hostname against the URL Bloom filter with an authoritative
  database fallback.
- Blocklist sources are stored in `domain_blacklist_sources` with a `BIGINT` lookup id. `upsertBlacklistSources()` takes an advisory transaction lock and uses PostgreSQL 18 `MERGE` to update configured sources and insert missing ones without burning identity sequence values for existing rows.
- BlocklistProject sources use the raw GitHub `alt-version/*-nl.txt` files because the service stores plain domain lists without hosts-file IP prefixes.
- URL and email Bloom filters use ready-aware Valkey Lua probes. Warmup enqueues rebuilds but does not create empty filters, because a fast negative from a partial filter would incorrectly bypass the authoritative database blacklist check.

Downloading, diffing, and writing new/removed domains for a source lives in
[`@services/urls-domains-blacklist-sync`](../urls-domains-blacklist-sync/README.md) — split
out so this package's dependency-closure stays free of `pg-copy-streams`.

## Related

- [URL Domains Blacklist Sync Service](../urls-domains-blacklist-sync/README.md)
- [URL Domains Blacklist System](../../queues/urls-domains-blacklist/README.md)
- [Domain Blacklist Check Service](../domain-blacklist-check/README.md)
- [Hostname Blocking Service](../hostname-blocking/README.md)
