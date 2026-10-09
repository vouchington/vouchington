# URL Domains Blacklist

Source entrypoint: [backend/services/urls-domains-blacklist/README.md](../../../../../backend/services/urls-domains-blacklist/README.md)

## Goals:

- Avoid IOPS and writes to the writer endpoint.

## Acceptance

This holds the blacklist source registry, domain lookup checks, and the Bloom filter
warmup/mutation helpers. We keep track of hostnames.

- One shared helper (`resolveBlocklist`) owns the hostname-policy decision for
  the batched `getHostnamePolicies()` / `getHostnamePolicy()` (blocking plus `should_skip_web_risk`),
  and the robots check `checkDomainBlacklisted()`. The robots check keeps its own local predicate
  (`is_crawlable = FALSE OR is_blocked = TRUE`, exact hostname).
  - **Flag on** (`bloom-filter-config.urlBlocklistBloomFilterEnabled`, default on): one ready-aware
    Bloom `mexistsIfReady` over every hostname suffix runs **concurrently** with the local
    `url_hostnames` read, so a negative adds no PostgreSQL round trip of depth. A definite miss also
    verifies the live filter key type on Valkey, as before, inside the same concurrent step. `blocklisted_domains` is
    read only for hostnames that are not already blocked locally and whose Bloom answer is "maybe"
    or unknown (filter missing, not ready, partial, or errored).
  - **Flag off**, or a caller that needs read-after-write (`client`, `query` or `readOnly: false`
    options): one full policy query, no Bloom command.
  - The flag check lives inside the Bloom read helpers (`checkBloomFilters`):
    a disabled filter answers "unknown, use the database", so no consumer can forget it.
- Serial depth per URL through `assertUrlAllowedByWebRisk`: 1 concurrent step (Bloom, local policy
  and the Web Risk clean-verdict/cooldown `Batch`), 1 more only for a Bloom "maybe", then the
  conditional limiter charge and provider call. This was about 6 serial round trips. Callers that
  check many URLs (`assertNoBlockedDomains`, `assertUrlsHaveNoBlockedHostnames`) read one batched
  policy for all hostnames and pass it into each per-URL check.
- Blocklist sources are stored in `domain_blocklist_sources` with a `BIGINT` lookup id. `upsertBlacklistSources()` takes an advisory transaction lock and uses PostgreSQL 18 `MERGE` to update configured sources and insert missing ones without burning identity sequence values for existing rows.
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

## Provisional export status (#1360)

These package exports are retained pending intended-use review. External production use is
unconfirmed; the exports may be made private or removed after review. Their implementations and
current owner behavior remain unchanged.

- `addDomainsToBloomFilter`
- `addDomainsToEmailBloomFilter`
- `deleteBloomFilter`
- `deleteEmailBloomFilter`
