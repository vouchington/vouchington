# Shared TypeScript

- Shared packages are safe in Node and Cloudflare Workers unless explicitly Node-only; accept bindings/options instead of backend assumptions/globals. Use [package inventory](../docs/overview/architecture/typescript-shared/README.md) and [Vitest authoring](../.agents/skills/vitest-test-authoring/SKILL.md) for tests/fixtures/mocks.
- [`env-contract`](../docs/overview/architecture/typescript-shared/env-contract/README.md) retains Voucha tooling metadata locally and delegates generic grouping/lookups to `@vouchington/utils`; runtime-reader migrations require explicit scope.
- Auth/session key changes update backend and Worker docs/tests together.
- `utm` stays universal without Node APIs; `utils` stays pure formatting/trust-tier/URL logic without framework dependencies.
- Runtime relative imports never escape package roots: relocated backend images do not preserve repository paths. Import siblings through `@ts-shared/*` instead; preserve [workspace boundary rules](../backend/dependency-cruiser-rules/workspace-package-relative-import-boundaries.cjs) under `pnpm run dep-cruise:backend`/`static-backend`.
