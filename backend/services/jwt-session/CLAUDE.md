# JWT Sessions

This service owns device/session JWT creation, verification, revocation, staleness invalidation,
and anonymous-session rotation flows.

Use [README.md](README.md) as the canonical reference for session behavior and Valkey state.

Agent-specific rules:

- Keep token verification, pairing, and rotation rules in this service instead of duplicating them
  in API routes or request context helpers.
- Keep JWT key parsing, signing, verification, and rotation behavior in
  `@ts-shared/session-jwt`. Do not reintroduce backend-local key loaders.
- Preserve the strict `dt` + `st` pairing guarantee. Do not reintroduce any `st`-only fallback.
- Per-request auth must verify `dt`/`st` pairing and Valkey revocation before authenticating a
  uid-bearing session. The request cache and hot/warm/cold refresh paths are canonical in
  [JWT session architecture](reference-architecture.md#hot--warm--cold-paths-patch-apiv1session).
- Call `markJwtStale(userId)` after any change to user roles or membership plan so the next
  PATCH /api/v1/session forces a cold-path DB reload.
