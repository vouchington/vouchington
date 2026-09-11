Review rate limiting. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Check [Rate Limiting](../../../docs/overview/architecture/rate-limiting.md) against one of its four layers: Cloudflare Worker edge IP limits (Layer 1), per-endpoint backend limits (Layer 2), user-aware trust tiers (Layer 3), or per-route backend limiting (Layer 4) via `ctx.applyRouteRateLimit()` and `ROUTE_REGISTRY` (`backend/services/route-rate-limits/config.mts`).
- Prioritize correct trust-tier derivation (OAuth/MFA/account-age/membership), new-account cooling, sensitive-category exceptions, route-registry drift or missing `applyRouteRateLimit()` coverage on mutating routes, and post-cache bot limits (`RATE_LIMITER_BOT_*`; see [Caching Strategy](../../../docs/overview/architecture/caching-strategy.md) for bot-tier caching, where cached responses are free).
- Keep thresholds configurable through the existing dynamic-config surface (DynamicConfig namespaces `rate-limit-thresholds` for Layer 3 and `route-rate-limit-config` for Layer 4) rather than hardcoding them; see [Dynamic Config](../../../docs/overview/architecture/dynamic-config.md).
- Do not weaken a limit or add a bypass without an explicit product or security requirement.
- Skip findings already covered by open issues or open PRs.
- Add or tighten tests for the selected limiter, tier computation, or threshold behavior.
