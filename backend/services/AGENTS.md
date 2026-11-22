# Services

- Load skills: `vouchington-postgres`, `postgres-node-performance-tuning`, `bounded-iteration`.
- Services docs: [services index](../../docs/overview/architecture/services/README.md).
- Stay within domain tables.
- Put `currentUserCan*` authorization in `authorization.mts`. Services may throw structured
  HTTP-status errors, but never handle responses, cookies, headers, or redirects.
- Functions make at most two direct `@data-stores/psql` calls outside explicit transaction
  resources; split larger work or use `await using`/`beginTransaction`.
- Call `markJwtStale(userId)` from `@services/jwt-session` after role or membership-plan changes so
  the next session PATCH forces a cold-path DB reload.
