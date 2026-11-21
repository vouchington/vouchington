Perform a security audit. Find one concrete, bounded improvement that is safe to ship in one PR. If none qualifies, make no repository changes and report why.

Unit: one threat area on one route group.

Load `security-rules`.

- Review one application threat area (authorization, SSRF, XSS, CSRF, security headers, webhook verification, file/image handling, admin actions) and least-privilege gaps in application permissions, IAM, route guards, or API checks. Authentication/session flows belong to [auth.md](auth.md); rate-limit policy to [rate-limiting.md](rate-limiting.md); agent tooling and sandbox permissions to [agent-sandbox-policy.md](agent-sandbox-policy.md).
- New mutation routes apply the domain's full guard set, not just `requireAuth`: `assertNotSuspended`, the domain's `currentUserCan*` gate, and domain limits (participant caps, target-user existence, block/mute). For messaging routes (`backend/api/v1/my/messages*.mts` to `backend/services/messaging/**`), follow [authorization.mts](../../../backend/services/messaging/authorization.mts) and verify a rejection-path integration test per guard.
