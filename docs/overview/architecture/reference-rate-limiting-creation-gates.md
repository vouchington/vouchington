# Rate Limiting reference

[Back to Rate Limiting](rate-limiting.md)

## Creation Gates

Beyond rate limiting, new accounts face hard gates that throw HTTP 403 and block certain actions outright. Unlike the 24h cooling period (which adjusts rate-limiting tier), these gates are enforced at the service layer and return explicit error codes:

| Gate                        | Requirement                                                | Error code           |
| --------------------------- | ---------------------------------------------------------- | -------------------- |
| **Community creation gate** | Must have username                                         | `IDENTITY_REQUIRED`  |
| **Contribution gate**       | Account must be ≥ 7d old to post or rate unless paid/admin | `CONTRIBUTION_GATED` |
| **Post/comment identity**   | Must have OAuth, or username + email                       | `IDENTITY_REQUIRED`  |

These gates apply on top of rate limiting. Admins bypass contribution gates. Vote endpoints bypass
only the contribution account-age gate; they still require authentication, verified
non-disposable email for free users, quota, access, and vote-specific rate-limit checks.

Per-action contribution cooldown and daily limits are documented in
[Contribution Limits](../../requirements/trust-safety/CONTRIBUTION-LIMITS.md).

**Files:** `backend/services/contribution-gating/`, `backend/services/communities/authorization.mts`, `backend/services/posts/authorization.mts`

## Pagination Limits (Anti-Scraping)

As a complementary anti-scraping measure, unauthenticated API requests are capped at 25 items per page regardless of the `limit` query parameter. Authenticated requests can request up to 100 items per page.

- Constant: `ANON_MAX_LIMIT = 25` in `backend/modules/search-utils/limits.mts`
- Applied at the route handler level via `clampAnonLimit()` when `!currentUser`
- Progressive rate limiting at the CF Worker edge is a separate, complementary layer (see bot tier differentiation plan)

## Related

- [User rate limits service](../../../backend/services/user-rate-limits/README.md) — Trust tier algorithm and rate limit categories
- [Backend rules](../../../backend/CLAUDE.md) — workspace service and data conventions
- [Valkey rate limiter](../../../backend/data-stores/valkey/CLAUDE.md) — Rate limiter client configuration
