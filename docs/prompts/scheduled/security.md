Perform a security audit. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Review one threat model area such as authentication, authorization, rate limiting, SSRF, XSS, CSRF, secrets, webhook verification, file/image handling, or admin actions.
- Look for least-privilege improvements in application permissions, IAM, cookies, headers, route guards, or API checks.
- New mutation routes (`POST`/`DELETE`/`PATCH`) must apply the domain's full guard set, not just `requireAuth` — suspension (`assertNotSuspended`), the domain's `currentUserCan*` gate, and domain limits (participant caps, target-user existence, block/mute). For messaging mutation routes (`backend/api/v1/my/messages*.mts` → `backend/services/messaging/**`), follow the cross-file contract summary in [authorization.mts](../../../backend/services/messaging/authorization.mts) and verify a rejection-path integration test exists for each guard.
- Add or tighten tests for the selected security issue when practical.
- This prompt is scoped to application threat models; agent tooling and sandbox permission surfaces
  (`.claude/settings.json`, `.codex/rules`, `sandbox.excludedCommands`) are audited separately by
  [agent-sandbox-policy.md](agent-sandbox-policy.md).
