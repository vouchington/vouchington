# Services

- Use [service architecture](../../docs/overview/architecture/services/README.md) for authorization, errors, deduplication, and batching; load [backend Vitest authoring](../../.agents/skills/backend-vitest-test-authoring/SKILL.md) for tests/provider mocks.
- Stay within domain tables; LLM orchestration belongs in `backend/agents/*`.
- Put `currentUserCan*` authorization in `authorization.mts`. Services may throw structured HTTP-status errors, but never handle responses, cookies, headers, or redirects.
- Store tokens/shared secrets through [`@modules/token-secrets`](../../docs/overview/architecture/backend/modules/token-secrets/README.md).
- Canonical post create/update completion awaits its started admission/cache promises while preserving durable responses; see [posts completion](../../docs/overview/architecture/services/posts/README.md#post-commit-completion). Other listener calls retain the policy below.
- Call entity-listener `enqueueOn*`/`enqueueBulkOn*` with `void`; they own failure reporting.
- Functions make at most two direct `@data-stores/psql` calls outside explicit transaction resources; split larger work or use `await using`/`beginTransaction`.
- Direct external API calls are annotated `/* no-mistakes: integration=<provider> */` functions. Apply owning [API](../api/AGENTS.md) and [PostgreSQL](../data-stores/psql/AGENTS.md) boundaries.
