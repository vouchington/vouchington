# Rate Limiting

Rate limiting operates at four layers, each protecting against different abuse patterns.

Contribution authoring has a separate action-policy registry. Its Safety/Pro/Plus/Free matrix is
pure configuration; the registry now resolves an internal global `authored_post` policy together
with a mapped type policy, while atomic dual-counter enforcement and public telemetry remain a
separate rollout.

The diagram below traces a single request through all four layers in order; Layer 4's threshold
lookup consumes Layer 3's trust-tier config directly (`getRateLimitThreshold`), so the two aren't
independent sequential gates so much as a config layer (3) feeding an enforcement layer (4).

```mermaid
flowchart TD
    Req[Incoming request] --> Edge{"CF Worker: IP bucket (GET/HEAD vs mutating, api vs web)"}
    Edge -- limited --> Edge429["429 at edge (Layer 1)"]
    Edge -- "cached/inline route without staging Basic Auth" --> Cached["Served from cache, rate limiting skipped"]
    Edge -- "ok, proxied to backend" --> Endpoint{"Layer 2: endpoint-specific limiter? (login, MFA, passkey, RSS)"}
    Endpoint -- limited --> Endpoint429["429"]
    Endpoint -- "ok or n/a" --> Killswitch{"Layer 4 enabled? (kill switch)"}
    Killswitch -- no --> Allowed["Allow"]
    Killswitch -- yes --> Registry["Look up ROUTE_REGISTRY category + multiplier"]
    Registry --> Auth{"Authenticated user?"}
    Auth -- yes --> Trust["computeTrustTier -> Layer 3 tier threshold x multiplier"]
    Auth -- no --> AnonT["Anon DynamicConfig threshold x multiplier"]
    Trust --> Keys["Build composite keys: ip/device/session/user/apikey/email"]
    AnonT --> Keys
    Keys --> Check{"Any dimension >= threshold?"}
    Check -- yes --> Blocked["429, most restrictive wins"]
    Check -- no --> Allowed
```

## Contents

- <a id="layer-1-cloudflare-worker-edge"></a>[Layer 1: Cloudflare Worker (Edge)](reference-rate-limiting-layer-1-cloudflare-worker-edge.md)
- <a id="layer-2-per-endpoint-backend"></a>[Layer 2: Per-Endpoint (Backend)](reference-rate-limiting-layer-1-cloudflare-worker-edge.md#layer-2-per-endpoint-backend)
- <a id="layer-3-user-aware-trust-tier-backend"></a>[Layer 3: User-Aware Trust Tier (Backend)](reference-rate-limiting-layer-3-user-aware-trust-tier-backend.md)
- <a id="layer-4-per-route-rate-limiting-backend"></a>[Layer 4: Per-Route Rate Limiting (Backend)](reference-rate-limiting-layer-4-per-route-rate-limiting-backend.md)
- <a id="creation-gates"></a>[Creation Gates](reference-rate-limiting-creation-gates.md)
- <a id="pagination-limits-anti-scraping"></a>[Pagination Limits (Anti-Scraping)](reference-rate-limiting-creation-gates.md#pagination-limits-anti-scraping)
- <a id="related"></a>[Related](reference-rate-limiting-creation-gates.md#related)
