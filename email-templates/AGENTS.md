# Email templates

- Load [Voucha brand](../.agents/skills/voucha-brand/SKILL.md) for user-facing copy and [Vitest authoring](../.agents/skills/vitest-test-authoring/SKILL.md) for tests/fixtures/mocks. Use [template docs](../docs/overview/architecture/email-templates/README.md), [monorepo map](../docs/development/MONOREPO.md), and applicable [backend rules](../backend/AGENTS.md).
- `@email-templates/core` exports prebuilt `dist/index.mjs`. Bundle React Email/React/React DOM here; keep them out of backend runtime dependencies.
- Recommendation emails mirror an existing in-app aside/recommendation source before copy is written.
