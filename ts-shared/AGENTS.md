# ts-shared

Shared code here must stay runtime-safe in both Node.js and Cloudflare Workers.

Use [README.md](README.md) for the package inventory and high-level purpose.

Before adding or changing a Vitest test, fixture, or mock, load the
[vitest-test-authoring skill](../.agents/skills/vitest-test-authoring/SKILL.md).

Agent-specific rules:

- Environment contract: [env-contract/README.md](env-contract/README.md)
- Keep shared packages free of backend-only assumptions unless the package is explicitly Node-only.
- `env-contract` keeps Voucha's tooling metadata local while delegating generic grouping and
  lookups to `@vouchington/utils`; do not make runtime readers depend on it unless that reader
  migration is explicitly in scope.
- Prefer env-agnostic helpers that accept bindings/options instead of reading globals at every call
  site.
- When auth/session key handling changes, update both [`backend/`](../backend/) and [`cloudflare-worker/`](../cloudflare-worker/) docs and
  tests in the same change.
- `utm` is universal — no Node.js-specific APIs.
- `utils` contains pure formatting, trust-tier, and URL manipulation logic — no framework dependencies.
- **No package-root-escaping relative imports in runtime source.** Packages here are consumed by
  the backend runtime, which relocates every workspace package under
  `workspace-packages/<virtual-store-dir>/<package-name>` — a path that does not preserve its
  repo-relative location. A relative import escaping the package root (e.g.
  `../../backend/x.mts` or `../../languages/y.mts`) would resolve to a path that does not exist in
  the runtime image. Import sibling packages by their `@ts-shared/*` package name instead.
  Enforced by the `workspace-package-boundary-*` rules in
  [`backend/dependency-cruiser-rules/workspace-package-relative-import-boundaries.cjs`](../backend/dependency-cruiser-rules/workspace-package-relative-import-boundaries.cjs),
  run via `pnpm run dep-cruise:backend` (CI: `static-backend`).
