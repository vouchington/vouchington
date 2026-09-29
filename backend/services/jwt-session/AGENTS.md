# JWT sessions

- Keep session verification, pairing, revocation, staleness, and rotation in this service; routes/context helpers do not duplicate it. [README.md](../../../docs/overview/architecture/services/jwt-session/README.md) owns behavior and Valkey state.
- Key parsing/signing/verification/rotation belongs in `@ts-shared/session-jwt`; never restore backend-local key loaders.
- Preserve strict `dt`+`st` pairing without `st`-only fallback. Authenticate uid-bearing sessions only after pairing and Valkey revocation checks; follow [hot/warm/cold paths](../../../docs/overview/architecture/services/jwt-session/reference-architecture.md#hot--warm--cold-paths-patch-apiv1session).
- Call `markJwtStale(userId)` after role or membership-plan changes so the next session PATCH forces cold-path DB reload.
