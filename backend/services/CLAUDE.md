# Services

Services contain business logic reused by APIs, workers, and other entrypoints. Architecture,
authorization, errors, deduplication, and batch patterns live in [README.md](README.md).

Load [backend-vitest-test-authoring](../../.agents/skills/backend-vitest-test-authoring/SKILL.md)
before changing service tests or provider mocks.

## Scoped invariants

- Keep each service within its domain tables. LLM orchestration belongs in `backend/agents/*`.
- Put authorization in `authorization.mts` with `currentUserCan*` names. Services may throw
  structured HTTP-status errors but must not contain response, cookie, header, or redirect logic.
- Store tokens and shared secrets through [`@modules/token-secrets`](../modules/token-secrets/README.md).
- Call entity-listener `enqueueOn*` and `enqueueBulkOn*` helpers with `void`; those helpers own
  fire-and-forget error reporting.
- Keep each function to at most two direct `@data-stores/psql` calls unless the work is inside an
  explicit transaction resource; split larger workflows or use `await using` with
  `beginTransaction`.
- Keep external API boundaries in directly annotated `/* no-mistakes: integration=<provider> */`
  functions.

## See Also

- Service package catalog: [../catalogs/README.md#services](../catalogs/README.md#services)
- [API routes](../api/CLAUDE.md)
- [PostgreSQL](../data-stores/psql/CLAUDE.md)
- [Backend context](../CLAUDE.md)
