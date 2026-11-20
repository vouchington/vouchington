# JWT sessions

- Keep session verification, pairing, revocation, staleness, and rotation in this service;
  routes/context helpers do not duplicate it.
- Key parsing/signing/verification/rotation belongs in `@ts-shared/session-jwt`; never restore
  backend-local key loaders.
- Preserve strict `dt`+`st` pairing without `st`-only fallback. Authenticate uid-bearing sessions
  only after pairing and Valkey revocation checks.
