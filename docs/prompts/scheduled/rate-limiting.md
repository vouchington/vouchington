Review rate limiting. Find one concrete, bounded improvement that is safe to ship in one PR. If none qualifies, make no repository changes and report why.

- Check [Rate Limiting](../../overview/architecture/rate-limiting.md) against one of its four layers: Worker edge IP limits, per-endpoint backend limits, user-aware trust tiers, or per-route limiting via `ctx.applyRouteRateLimit()` and `ROUTE_REGISTRY` (`backend/services/route-rate-limits/config.mts`).
- Prioritize trust-tier derivation (OAuth/MFA/account-age/membership), new-account cooling, sensitive-category exceptions, route-registry drift or missing `applyRouteRateLimit()` on mutating routes, and post-cache bot limits ([Caching Strategy](../../overview/architecture/caching-strategy.md)).
- Keep thresholds in DynamicConfig (`rate-limit-thresholds`, `route-rate-limit-config`; see [Dynamic Config](../../overview/architecture/dynamic-config.md)). Never weaken a limit or add a bypass without an explicit requirement.
- Boundaries: token/session/MFA/OAuth correctness is [auth.md](auth.md); other application threats are [security.md](security.md).
- MCP parity: a rate-limit or duplicate-window failure reachable from an MCP tool (`backend/mcp/`) must map to the same result the REST route returns.
