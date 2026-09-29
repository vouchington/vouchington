# Bloom Client

[Back to Valkey Data Store](README.md#bloom-client)

`bloomValkeyClient` is the dedicated client for Bloom commands and authoritative repair probes.
Its `name: 'bloom'` deduplication key forces a separate `GlideClient` even when
`VALKEY_BLOOM_URL === VALKEY_CACHE_URL`.

- `VALKEY_BLOOM_URL` defaults to `VALKEY_CACHE_URL`; point it elsewhere only for a dedicated Bloom
  deployment.
- `BLOOM_VALKEY_READ_FROM` is `primary` so live-filter and ready-marker reads observe rebuild writes
  consistently.
- `VALKEY_BLOOM_INFLIGHT_REQUESTS_LIMIT` optionally overrides the Bloom client's inflight budget.

This isolation prevents O(rows/5k) rebuild batches from exhausting `cacheValkeyClient`.
