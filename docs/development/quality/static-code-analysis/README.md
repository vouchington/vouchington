# Static Code Analysis

Source entrypoint: [static-code-analysis/README.md](../../../../static-code-analysis/README.md)

Rules live in code and config (`.no-mistakes.yml`, `.oxlintrc.json`, `ast-grep-rules/`, `static-code-analysis/`), not in this page. This page records where a new guard belongs, how to author and roll one out, and the reasoning behind a few rule families. Before authoring or changing a guard, use the [static-analysis-checklist skill](../../../../.agents/skills/static-analysis-checklist/SKILL.md). Scoped repository-state invariants are in [AGENTS.md](../../../../static-code-analysis/AGENTS.md). The `config-inventory/` check generates `./dev/config-inventory` and keeps env-var, DynamicConfig, workflow-env, and package-manager gate documentation in sync with code.

## Where To Put A New Rule (Priority Order)

Pick the highest tier that can express the rule. Keep rules small and focused (#4988).

0. **Anti-pattern or style preference?** If the rule is prescriptive style ("how we prefer to code"), do not add a check; document the convention. Only real bug, safety, drift, or foot-gun anti-patterns justify a guard.
1. **Off-the-shelf tool config.** Zero custom rule code: oxlint built-ins and plugins, `dependency-cruiser` for boundaries and cycles, `knip` for unused exports and dependencies, `tsc` strict options, `syncpack`, `squawk` for SQL, `jscpd` ([threshold](jscpd/README.md)), `oxfmt`, `selene`. The pnpm workspace graph is the source of truth for dependency edges; expose CLI-only dependencies through package scripts so Knip can trace them.
2. **AST-grep YAML rule** for single-file syntactic patterns, kept declarative. Unconditional, product-free rules belong in the `vouchington-tooling` pack; product-specific or helper-coupled rules stay in [`ast-grep-rules/`](../../../../ast-grep-rules/).
3. **`no-mistakes` rule** for cross-file, filesystem, or app-graph invariants, and anything generic enough to apply outside this repository. Upstream-first: if the concept is not Voucha-specific, implement it upstream and configure it here instead of writing a repo-local parser.
4. **Custom Node check in `run-node-checks.mts`.** Avoid. Only for filesystem invariants `no-mistakes` cannot yet express. Keep baselines and path tables out of `.mts` rule files; when a rule accumulates baselines or control-flow special cases, reassess its tier.

## Guard Authoring Checklist

Before the first push of a new or changed guard:

- Cover the adversarial matrix: static, type-only, `require`, and dynamic imports; aliases, namespace and member aliases; spreads, rest and nested destructuring; partial mocks. Verify every AST shape that can carry the pattern (bare, template, and tagged-template strings; JSX attributes in both forms; element names; array positions; property keys and values; arrow bodies). A missed shape is the most common source of post-merge follow-ups.
- Each new branch gets a positive and a negative fixture with exact diagnostics. Guards that parse need direct parser-output tests, boundary states (empty, null, sentinel, multi-byte), and safe sentinels instead of throws on malformed input. Fixtures mirror real repository patterns, not rule-shaped toys.
- Repo-wide file guards need a fixture outside the first obvious directory, so scan-scope regressions fail locally. Use oxfmt-shaped Markdown fixtures; do not depend on hand-aligned table padding. Match export shape rather than `content.includes('symbol')`.
- Before replacing a parser or format library, follow the [Parser and Library Swap Checklist](../../../checklists/parser-library-swap.md). Analyzer and dependency-cruiser migrations need runner-parity fixtures proving source intent and severity match every entrypoint (package scripts, per-file runners, CI) before the old guard is deleted.
- Tests that only inspect repository-root paths and import no workspace code belong under `static-code-analysis/`.
- When review catches a pattern class, add fixtures for the whole class before pushing again.

AST-grep footguns:

1. Without `stopBy: end` on a `has`/`inside`/`follows`/`precedes` clause, the matcher stops at the first child match.
2. `kind: jsx_opening_element` does not match `<Foo />`; add `jsx_self_closing_element`.
3. `sgconfig.yml` parses `.ts`/`.mts`/`.cts`/`.tsx` as `Tsx`, so one rule lists both globs and no `-tsx` companions exist. Angle-bracket assertions are invalid TSX.
4. A catch-block rule that early-returns skips sibling nodes; set a flag and check it after the block.
5. Zero hits on a new enforcement rule against the real repo is a red flag: the rule is too narrow or a `files:` glob is mis-scoped.
6. ast-grep uses Rust `regex`: no lookarounds or backreferences, and they fail silently. Consume the token and assert with `not:` or `has:` instead. For alternation, test with a multi-argument factory call, which can over-consume.
7. Rules need `isValid: false` and `isValid: true` examples whose `file:` paths match and do not match `files:`/`ignores:`; `vouchington ast-grep-examples` runs them.

## Rolling Out A Repo-Wide Guard

When a guard flags many existing files, split the rollout so reviewers can verify guard behavior before remediation lands. PR 1 introduces the guard, its CI wiring, and an externalized baseline or warn-level setting, with no broad remediation. PR 2 removes baseline entries or fixes violations in bulk. A guard that flags zero files, or a few with a straightforward fix, can land in one PR. The motivating counter-example is a complexity guard bundled with a large refactor.

Oxlint has no baseline mechanism and runs with `--deny-warnings`, so warnings fail like errors. Stage an existing Oxlint backlog as an explicit `"off"` entry that links its remediation issue, then move it straight to `"error"` when remediation lands. Do not build a repository-owned baseline for an off-the-shelf Oxlint rule. `oxlint -D plugin/rule` does not reliably override an explicit `"off"` entry, and jsPlugin rules can report a false zero until the config sets `"error"`, so verify any jsPlugin enable with a full `pnpm exec oxlint --type-aware --deny-warnings` run. An `"off"` rule is a staged or intentional policy choice, not necessarily a backlog.

## Nested .oxlintrc.json

Nested Oxlint configs do not inherit ancestor `overrides` or `plugins`: they restate the root `plugins` array (including `node`), and a narrow override such as the production-only `typescript/no-explicit-any` is repeated in `web/.oxlintrc.json`. Changing a root override or plugin means checking every nested config; a fixture should assert the effective behavior in nested workspaces, not only the root.

## Enforcement Policy

The `backend-no-enqueue-and-wait` ast-grep rule rejects queue result waits and misleading
`enqueue*AndWait` names across backend code, including tests. Queue admission may still be awaited;
the forbidden operation is waiting for another job's completion instead of durable state.

Markdown reachability and structure-budget gates run without baselines: fix violations by linking, splitting, or reorganizing, not with an exception registry. Reachability requires every included document to be discoverable from a tracked `AGENTS.md` through `README.md` indexes. A long document may contain at most one table and one Mermaid fence. Run the check with `pnpm run no-mistakes`; do not force the root `--tsconfig`, which lacks package aliases such as the web `@/*` mapping and hides reachable imports from graph checks.

Raw PostgreSQL SQL in backend tests belongs in focused first-layer helpers under the repository root `test-helpers/**` or a top-level workspace's `test-helpers/**`. Nested aliases, `test-support` directories, forwarding modules, and `test-helpers` in file basenames are rejected without a baseline, so tests consume typed setup and assertion operations rather than SQL executors.

## Dependency License Policy

`dependency-license-policy/` checks `pnpm licenses list --json` SPDX expressions for the full dependency graph, not `--prod`, which misclassifies at least one dev-only package as production. GPL, AGPL, LGPL, EPL, CDDL, SSPL, BUSL, MPL, and unlicensed or unknown packages are denied; unknown identifiers and unparseable expressions fail closed. Two copyleft entries are allowlisted narrowly in `policy.mts` because nothing from either family is vendored or shipped in a build artifact: `MPL-2.0` repo-wide and `LGPL-3.0-or-later` only for the audited `@img/sharp-*` packages. Widening an allowlist needs the same narrow scope plus reasoning.

## Knip Production Exports

`pnpm run knip:production-exports` checks backend exports kept alive only by tests. The full Knip scan also checks exports used only within their defining file in the root and web workspaces. Backend's existing in-file setting remains until its production exports are qualified. Workspace entries continue to model the existing external runner and framework boundaries. Backend packages with a wildcard `"./*"` manifest export also declare `"./*.test.mts": null` and `"./*/__tests__/*": null`, because Node honors the single-star key and ignores the multi-star one while nothing imports a test file by specifier. An AST-grep rule requires both keys as direct siblings of the wildcard.

Production imports of test infrastructure make fixture implementation part of the runtime and can make test-only exports appear production-used. Dependency boundaries preserve that separation while allowing the canonical configuration needed by test runners.

## Runtime work tunables

Numeric constants named `*BATCH_SIZE`, `*PAGE_SIZE`, `*CHUNK_SIZE`, `MAX_BATCHES`, or `*_PER_RUN` in backend runtime code must come from an owning DynamicConfig value, and direct batch or page-size `process.env` reads are rejected, so operators can tune bounded work without a deploy. External protocol ceilings need an exact allowlist entry with a reason; stale entries fail.

## Migration artifact cleanup

The relational-storage guard reads the generated schema snapshot with no debt inventory: every UUID array, UUID reference without a target foreign key, and scoped encoded key fails unless an exact entry in the reviewed catalog covers it. Structured documents, data points, change history, and reviewed opaque or provider JSON stay JSON; a JSON column is not a defect. A stale catalog entry fails. See the [schema policy](../../postgres-schema-rules.md#prelaunch-relational-storage).

## PostgreSQL Conflict Ordering

`postgres-conflict-ordering` and `postgres-lock-ordering` (catalog-backed `no-mistakes` rules over the generated [catalog](../../postgresql/schema-snapshot/README.md#no-mistakes-catalog)) require a multi-row UPSERT's conflict target and source `ORDER BY` to begin with the same unique-index key sequence, and multi-row row locks to follow the same prefix, so concurrent writers acquire locks in one order and cannot deadlock. Dynamic SQL that reaches the parser fails closed. Tests, fixtures, migrations, views, and manual scripts are outside the production paths.

## Effective Vitest project timeout admission

The root Vitest config installs a `configureVitest` plugin that rejects an effective selected-project test or hook budget that is disabled, non-finite, or above the suite cap before application global setup imports. It does not cover per-test overrides or later runtime changes; source-carrier analysis (`no-mistakes/vitest-timeout-cap`) owns those, and unresolved findings stay open rather than gaining new ignores.

## Web route localization map

`i18n-extract/route-selector-map.mts` makes one `no-mistakes` `analyzeProject` call with a dependency report per route and global-chrome file, writes the route selector map and the catalog's `routes.json`, and fails on unresolved local specifiers, computed `import()`/`require()`, unbounded `t()` assembly, and production `as MessageKey` casts. The `workspace` relationship is load-bearing: dropping it silently expands closures and changes membership for hundreds of routes. The generator scans quoted alias-shaped literals, not `t()` calls through an AST, so finite alias registries must live in a module the route graph can reach. Its `--check` form runs in static CI; regenerate and commit both artifacts when a route, its imports, shared chrome, or a web alias changes membership. See [localization requirements](../../../requirements/users/LOCALIZATION.md).

## Live policy inputs and finite controls

The root repository-file policy command runs the released Docker image mirror and Trivy scan and
exception checks alongside the repository-specific aggregate. Static CI runs those released checks
as separate steps. The aggregate still owns workspace root catalog correspondence; finite unit
controls supply source trees instead of scanning the checkout. Shell quoting uses its existing
aggregate guard with finite YAML and shell controls. Literal Vitest project exclude arrays are
checked by the canonical ast-grep scan; resolved-project behavior remains a unit contract.
