# Caching Strategy reference

[Back to Caching Strategy](caching-strategy.md)

## Cache Tiers

The read path below traces a request across all three tiers, plus where the invalidation/purge
path re-enters at Tier 1.

```mermaid
flowchart TD
    Req[Client request] --> Aud
    subgraph Tier1["Tier 1: CF Worker edge (Workers Cache)"]
        Aud{"Cacheable audience? (bot/anon/static)"} -- "no: authenticated/bypass" --> Bypass["Proxy directly to origin"]
        Aud -- yes --> Hit{"Workers Cache HIT?"}
        Hit -- HIT --> Rewrite["Rewrite placeholder nonce, return"]
        Hit -- MISS --> Origin["CachedOrigin fetches backend/web origin"]
    end
    Bypass --> Backend["Backend handles request"]
    Origin --> Backend
    subgraph Tier3["Tier 3: Backend Valkey cache"]
        Backend --> VCheck{"Valkey entity/search hit?"}
        VCheck -- yes --> VHit["Return cached value"]
        VCheck -- no --> PG["Query PostgreSQL, populate Valkey"]
    end
    VHit --> Headers["Tier 2: backend sets Cache-Control (60s lists, 300s entities, logged-out only)"]
    PG --> Headers
    Headers --> EdgeWrite["CF Worker overwrites max-age with edge TTL, writes Workers Cache"]
    Mutation["Mutation"] --> Invalidate["invalidate.mts: unlink Valkey key, mint Cache-Tag"]
    Invalidate --> Purge["POST /infra/cache-purge to CachedOrigin.purge"]
```

### Contents

- <a id="tier-1-cf-worker-edge-cache-workers-cache"></a>[Tier 1: CF Worker Edge Cache (Workers Cache)](reference-tier-1-cf-worker-edge-cache-workers-cache.md)
- <a id="bot-tiers"></a>[Bot Tiers](reference-bot-tiers.md)
- <a id="origin-and-browser-vary-boundaries"></a>[Origin and Browser `Vary` Boundaries](reference-origin-and-browser-vary-boundaries.md)
- <a id="navigation-performance"></a>[Navigation Performance](reference-navigation-performance.md)
- <a id="tier-2-backend-http-cache-control"></a>[Tier 2: Backend HTTP Cache-Control](reference-tier-2-backend-http-cache-control.md)
- <a id="tier-3-backend-valkey-cache"></a>[Tier 3: Backend Valkey Cache](reference-tier-3-backend-valkey-cache.md)
