# Static Code Analysis

Static-analysis tools, policy checks, link checks, and invariant tests for repository structure.
Before authoring or changing a guard, use the
[static-analysis-checklist skill](../.agents/skills/static-analysis-checklist/SKILL.md) and read the
placement, authoring, rollout, and cleanup sections below. Scoped repository-state invariants remain
in [CLAUDE.md](CLAUDE.md).

## Dependency License Policy

[`dependency-license-policy/`](dependency-license-policy/) enforces a license policy against
`pnpm licenses list --json`'s SPDX expressions for every third-party dependency resolved into the
repo. It scans the full graph (no `-r`/`--recursive`, no `--prod`): `pnpm licenses list --prod`
misclassifies at least one dev-only package, `lightningcss`, as production, even though every one
of its dependency paths bottoms out in `devDependencies`. The published
[`vouchington-tooling/dependency-license-policy`](https://github.com/vouchington/vouchington-tooling)
module validates SPDX expressions and collects the all-platform report; this repository's local
`policy.mts` supplies the GPL, AGPL, LGPL, EPL, CDDL, SSPL, BUSL, MPL, and unlicensed/unknown
denials. Unknown identifiers, custom `LicenseRef` / `DocumentRef` atoms, and expressions the parser
cannot parse fail closed (denied), never silently pass.

Pnpm filters the lockfile walk through its platform-installability check. The collector therefore
derives a temporary, command-scoped workspace whose `supportedArchitectures` cover every `os`,
`cpu`, and `libc` value in the lockfile, including non-runner targets. It runs `pnpm fetch` without
lifecycle scripts and with incompatible optional packages included in that disposable workspace
before `pnpm licenses list`. Both commands use the same audit-only content-addressable store beneath
the temporary workspace, guaranteeing that a clean runner has every package manifest without
expanding or polluting the normal cached pnpm store. A newly locked platform is included
automatically, and malformed selectors fail the policy instead of silently under-scanning. The
temporary workspace and its store are deleted after the scan and do not expand normal developer or
CI installs with every native binary package. The audit temporarily needs enough free disk for all
locked platform packages, so clean-runner validation must retain peak-disk evidence when runner
sizing changes.

LGPL and MPL are denied by default (any future dependency introducing an unreviewed variant fails
closed) but the two copyleft entries the graph is already known to contain are allowlisted in local
`policy.mts`, each narrowly scoped and justified: `MPL-2.0` (file-level copyleft covering
`@ghostery/*`, `@remusao/*`, `satori`, `web-push`, and other entries) is allowlisted repo-wide, and
`LGPL-3.0-or-later` is allowlisted only for exactly fourteen audited `@img/sharp-*` packages: the
10 `sharp-libvips-*` variants plus `sharp-wasm32` and the three `sharp-win32-*` variants.
Neither creates an obligation today: nothing from either family is vendored, modified, or shipped
in a committed build artifact.
Widening either allowlist entry (a new package name, a new license family) needs the same
narrow-scope-plus-reasoning justification as the existing entries, not a blanket relaxation.

`pnpm licenses list` occasionally reports a package's `package.json` `license` field verbatim even
when it is not valid SPDX syntax — `geist@1.7.2` ships the free-text string
`SIL OPEN FONT LICENSE` instead of the SPDX identifier `OFL-1.1` (`@fontsource/inter` reports the
same underlying font license correctly as `OFL-1.1`). A small `KNOWN_LICENSE_ALIASES` map in
`policy.mts` normalizes confirmed, unambiguous cases like this before parsing; add to it only when
a new non-SPDX string is confirmed to name exactly one real SPDX license, not to paper over
genuinely ambiguous text.

Run it locally with `pnpm run dependency-license-policy` or
`node static-code-analysis/run-node-checks.mts --checks dependency-license-policy`. A denied match
reports the package name, version, and offending SPDX atom, and points at `policy.mts` for a
narrowly-scoped allowlist addition if the match is a legitimate false positive.

## Web route localization map

[`i18n-extract/route-selector-map.mts`](i18n-extract/route-selector-map.mts) requests one
`no-mistakes` `analyzeProject` dependency report per tracked `web/app` page (with ancestor layouts)
and per global-chrome file, with `relationships: ['import-static', 'import-dynamic', 'import-type',
'workspace']`. `no-mistakes` follows dynamic import targets recursively in that same graph pass,
including nested/transitive `next/dynamic` wrappers, re-exports, and type imports — there is no
`dynamic-import-closure.mts`. `workspace` is load-bearing, not a legacy leftover: dropping it
(verified empirically) silently expands the closure and changes the generated catalog membership
for hundreds of routes, so it must stay even though `import-dynamic` alone looks like it should
cover proven dynamic imports. A second `analyzeProject` call batches `resolveCheck` over the union
of those closure files and fails generate/`--check` on unresolved local specifiers (relative, root,
or `@/` aliases) and on computed `import()`/`require()` rows, except a reviewed exclusion list.
Package specifiers stay external. The generator also fails computed `import()` lexically. It then
scans quoted alias-shaped literals only, fails unknown catalog aliases, and fails unbounded `t()`
assembly and production `as MessageKey` casts. It does not parse `t()` with an AST. Sidebar chrome aliases come from the layout graph
(`layout` → `RootAppShell` → `AppSidebar`); there is no catalog prefix dump. It writes the
committed route selector map and the catalog's generated pattern-keyed route membership
(`localization/catalog/routes.json`). Alias-less rows retain routes with no route-local copy. Run
it without flags to regenerate both artifacts, with `--check` to verify them, and add
`--diagnostics` for stderr-only phase timings and a computed-closure count (never affects the
generated artifacts; the closures themselves are not dumped, since a full closure listing can
reach megabytes). The `--check` form runs in
[`static-code-analysis.yml`](../.github/workflows/static-code-analysis.yml). The companion
[`route-bounds.test.mts`](i18n-extract/route-bounds.test.mts) resolves every generated route
against the real catalog compiler in all four web locales and all public request limits. See
[localization requirements](../docs/requirements/users/LOCALIZATION.md) for the runtime request.

## Markdown Information Architecture Gates

`no-mistakes` 0.36.0 enforces two repository-wide Markdown gates over tracked documentation
(excluding instruction, article, fixture, and test-case paths configured in
[`.no-mistakes.yml`](../.no-mistakes.yml)). Run the canonical local check with
`pnpm run no-mistakes`; required static-analysis CI and the required CI static-analysis
matrix run the same check. See [CI static analysis](../docs/development/ci.md#static-analysis-static-code-analysisyml)
and [local static analysis](../docs/development/tests.md#linters-and-static-analysis).

- **Reachability**: every included Markdown document must be discoverable from a tracked
  `CLAUDE.md` link, either directly or through exactly one `README.md` intermediary
  (`CLAUDE.md → README.md → document`), at a maximum graph depth of two.
- **Structure budget**: a document exceeding 180 Rust-counted lines or 12,000 Unicode scalars may
  contain at most one GFM table and one Mermaid fence. Smaller documents are not subject to this
  budget.

### Enforcement Policy

Markdown reachability and structure-budget rules run without baselines. Fix violations by linking,
splitting, or reorganizing the documentation; do not suppress them with an exception registry.

### Backend test SQL and helper placement

Raw PostgreSQL SQL belongs in focused first-layer helpers, and test helpers live
only in the repository root `test-helpers/**` or a top-level workspace's `<top-level>/test-helpers/**`
root. The selected helper alias is the literal `test-helpers` directory at that first layer; nested
aliases, `test-support` directories, and forwarding modules are not permitted. Backend tests consume
typed setup and assertion operations from those roots rather than importing SQL executors or SQL
statement types directly.

The error-level `no-sql-in-backend-tests` AST-grep rule enforces the SQL boundary for every backend
test, including PostgreSQL-owned tests. The repository-scoped `banned-paths` configuration rejects
nested `test-helpers` and the explicit `test-helper`, `test-support`, `test-utils`/`testutils`,
`test-utilities`/`testutilities`, and `testing-helper`/`testing-helpers` aliases without a baseline.

The `web-no-raw-api-response-client-boundary` rule protects audited `.ts` and `.tsx` client
boundaries from regressing to raw API envelopes. Narrow server projectors are required; the mixed
SSR/browser-pagination `PostList` boundary carries the single reasoned inline exception.

AST-grep entrypoints honor each YAML rule's declared severity: `error` rules block, while `warning`
rules support staged cleanup without blocking. Do not pass a bare `--error`, which promotes every
diagnostic and defeats warning-level rollouts. Existing `severity: error` rules such as
`no-sql-offset` still exit nonzero and block without the CLI `--error` flag.

The error-level `backend-persisted-user-random-username` rule enforces persisted-user fixture
safety. It reports `randomUUID()`, `crypto.randomUUID()`, `Math.random()`, and `Date.now()` inside
an explicit `username` property passed to the direct `createTestUser`, `createTestUserDirect`,
`createUnonboardedTestUserDirect`, or `createTestUserWithAge` factory identifiers unless that
producer is nested in a direct `safeUsername(...)` call. Its `.mts` scope is limited to `backend`,
`integration-tests/web-api`, and `playwright`. This first syntax-only boundary intentionally does
not resolve aliases, member receivers, precomputed values, spread-only options, or the positional
`createTestUserWithId` API; expand it only with new positive and negative examples.

The error-level `no-redundant-test-user-fixture-non-null-assertion` rule blocks postfix assertions
on the total persisted-user creators. It recognizes direct, aliased, and namespace imports from the
test-helper user entry points and the users service test-support entry point, covering both
`(await createTestUser(...))!` and identity `createTestUser(...).then(user => user!)` shapes for all
four creator names. Nullable `getTestPrivateUserById` calls, casts, optional chaining, explicit
assertion helpers, unrelated same-named functions, callbacks that dereference the asserted value
(such as `.then(user => user!.id)`), and non-test source paths remain outside this first rule. Its
staged rollout (#11239) removed all reported callers in bounded project-owner batches before the
promotion; it is now enforced as `error` and reported callers block CI.

The `error`-level pagination rules detect legacy API `cursor` parameters, public `omitLimit`,
exact-limit `has_next_page` calculations, reintroduction of the removed `toListResponse` helper,
and inline `page_info: EMPTY_PAGE_INFO` outside its allowlisted provably-empty sites
(`pagination-empty-page-info-allowlist`), alongside the existing error-level `no-sql-offset` rule.

Swift/.NET presentation, localization, and native resource validation now belong to
[`vouchington/vouchington-clients`](https://github.com/vouchington/vouchington-clients). Vouchington
retains the shared API-fixture producer contracts those clients consume rather than claiming local
coverage of external native source.

The shared `vouchington ast-grep-examples` harness batches distinct semantic snippets through one native
`ast-grep test` invocation, then runs at most one `ast-grep scan` per scoped rule to verify
`files:` and `ignores:` path routing. That scan layer replays the real project `sgconfig.yml`'s
`languageGlobs` into each rule's synthetic scan directory, so a `languageGlobs` regression for any
language fails a test instead of
silently disabling a rule. Keep path-exemption examples alongside semantic examples in each rule's
`examples:` block.
The backend test `process.env.ENVIRONMENT` mutation guard is intentionally narrow because
auto-fix PR #8260 identified a shared-worker import race around deployment-environment mutation;
the change was superseded by merged PR #8277. Tests should pass env objects into the helper under
test instead.

The scope-aware Oxlint
`voucha/backend-contract-program-construction-location` rule keeps backend API contract compiler
construction in the memoized backend-program owner, including the
public compiler-host and language-service construction families. It resolves TypeScript value imports, namespace aliases, extracted
factory capabilities, exact proven Node `createRequire()` loads, assignments, optional calls, and
lexical shadows. Its execution boundary covers direct calls and constructors, tagged templates,
decorators, the standard `call`/`apply`/`bind` and `Reflect.apply`/`Reflect.construct` forms
(including `Reflect.construct.call` and `Reflect.construct.apply`), and
callable wrappers created by bound functions, subclasses, or an unshadowed global `Proxy`.
Arbitrary callback and protocol sinks such as `map`, `then`, event handlers, and coercion hooks are
outside this syntax-and-provenance rule; do not pass protected factory capabilities into them.
It covers program, builder, watch, solution-builder, compiler-host, and
language-service factories: `createCompilerHost`, `createIncrementalCompilerHost`,
`createWatchCompilerHost`, `createSolutionBuilderHost`, and
`createSolutionBuilderWithWatchHost` complete the host family. It rejects value re-exports at
their first protected-module edge. The same-named
AST-grep rule is a context-free companion limited to exact named imports, direct value re-exports,
and awaited `import('typescript')` syntax; it does not guess provenance from a
`createProgram` spelling. It also covers the one context-free dynamic-loader shape ast-grep can
match without data-flow analysis: a `createRequire(<arg>)('typescript').FACTORY(...)` chain (and
its bracket-index variant) that dependency-cruiser's module-graph resolution cannot see, since the
`'typescript'` specifier appears only at the call site, not as a static import/require edge. That
arm matches the literal `createRequire` identifier without verifying it is bound to `node:module`'s
export, so a same-named, same-shaped domain helper is a documented false positive; every
multi-statement, destructured, aliased, shadowed-parameter, or reassignment variant of this loader
shape stays covered only by the scope-aware `create-require-provenance.cjs` Oxlint rule, which
remains authoritative for that provenance. A
third, coarser guard, the dependency-cruiser `no-api-fixtures-typescript-reachability` rule
(`backend/dependency-cruiser-rules/api-fixtures-typescript-reachability.cjs`), adds a
module-graph backstop against _new_ `backend/test-helpers/api-fixtures/` files that directly
import or `require()`-load the `typescript` module. It deliberately omits `to.reachable: true`
(tried and reverted after producing false positives on files transitively importing an
already-exempted type-guard consumer), so it is a direct-edge check only: a new file that reaches
`typescript` solely through an intermediate wrapper module is not caught here. That indirection
stays owned by the scope-aware Oxlint rule. Unlike the Oxlint/AST-grep
pair, this guard cannot distinguish program construction from type-guard-only usage (`ts.SyntaxKind`,
`ts.isInterfaceDeclaration(...)`), so it carries a closed, non-growing allowlist of files already
doing the latter as of its introduction and does not flag any file today. Contract tests must
consume the owners rather than constructing programs
themselves. The companion `backend-contract-virtual-program-matrix-lifecycle`
rule requires a contract test's matrix build to live inside the function callback directly passed
to `beforeAll`: that callback must be the build call's nearest enclosing function boundary. It also
scans non-test API-fixture helper modules, preventing wrappers from hiding per-call, module-scope,
or helper-owned construction; only the matrix implementation and its dedicated test are excluded.
This prevents the original per-assertion rebuild shape, eager construction while evaluating
`beforeAll(...)` arguments, and deferred builds hidden in a nested, returned, or generator
function. It requires `import.meta` as the exact first argument; the matrix owner rejects a second
build in the same module execution while allowing the file to execute again during a watch rerun.
Contract tests must keep
`buildVirtualProgramMatrix` under its direct value-import name: the lifecycle rule bans value-import
aliases, local aliases, and property/destructuring extraction because AST-grep cannot follow those
aliases to prove their eventual call remains inside the callback. Type-only import aliases are safe.

The `backend-no-direct-scheduler-upsert` AST-grep rule keeps recurring jobs in the typed
`@modules/scheduled-job-manifest` catalog. Queue packages use its runtime helper instead of calling
GlideMQ's `upsertJobScheduler`, `getRepeatableJobs`, or `removeJobScheduler` directly. `no-mistakes` 0.42.0 then enforces that every scheduled-job
manifest is reachable from both the API catalog and a worker runtime, and that every worker module
is reachable from a runtime definition root.

The scope-aware Oxlint `no-mistakes/postgres-cursor-call-contract` rule protects the two PostgreSQL
cursor executors exported by `@data-stores/psql` and `@data-stores/psql/cursors`. Production callers
must invoke the exact import or namespace member directly and expose SQL at that callsite, either
inline or through one immutable local binding. The leading static text must contain a complete,
non-empty `/* name */` annotation. Aliases, dependency containers, dynamic builders, reassignment,
and helper-parameter flow are rejected at their boundary instead of being interpreted. The narrow
`voucha/account-export-cursor-drains-serial` companion keeps the two account-data export cursor
owners on serial drains so each PostgreSQL client is released before the next stream starts. Both
rules are exercised through the real Oxlint JS-plugin runner.

AST-grep YAML rules are loaded from the shipped `vouchington-tooling` unconditional pack
(`astGrepPackPaths()`) and from repository-local [`ast-grep-rules/`](../ast-grep-rules/).
`sgconfig.yml` lists only the tracked local directory so `config-path-references` can verify it;
`pnpm run ast-grep` prepends the installed pack at scan time. Put product-specific or
helper-coupled single-file syntactic invariants in the local directory when no package-owned rule
exists. Each rule carries its positive and negative examples, validated by the shared
`vouchington ast-grep-examples` command. The aggregate passes `--no-ignore hidden` so
dot-directories are included. Run one local rule directly with
`pnpm exec ast-grep scan --no-ignore hidden --off=unused-suppression --rule
ast-grep-rules/<rule-id>.yml`. Generic invariants available in no-mistakes belong in
[`.no-mistakes.yml`](../.no-mistakes.yml), not duplicated here.

The dependency-cruiser `no-build-insert-query-outside-entity-relations` rule is the sole owner of
the raw relation-insert primitive boundary. Its installed-path fixtures prove that the module edge
is rejected through direct imports, local aliases, and re-export chains while permitted
entity-relations owners and unrelated same-named local functions remain valid. A context-free
AST-grep call-spelling companion would add false positives without covering a distinct invariant.

The Oxlint rate-limiter guard deliberately protects syntax rather than tracking `RateLimiter`
provenance: a hazardous alias must first cross a statically named `.invalidate` member read or an
object-pattern extraction, so banning that boundary also covers imports, instances, factories,
parameters, containers, `this`, aliases, optional access, and `bind`/`call`. Bare `invalidate`
identifiers and domain-specific reset functions remain valid. Two entity test helpers retain
exact file-, AST-, and canonical-`ValkeyCache`-binding exceptions for legitimate domain-cache
resets; the email-domain exception additionally requires its literal cache prefix.

The durable UUID guard (`no-durable-random-uuidv4.yml`) keeps new app-owned IDs in the current post, community, import-batch, and Bedrock batch creation paths on UUIDv7. It is intentionally narrow and does not police temporary tables or filenames, request/correlation tokens, or analytics event IDs.

The `gh-api-no-query-string.yml` rule bans a `gh api` argument-array element that hand-builds a query
string — a `/`-bearing string or template literal that also carries a `?`, i.e. an endpoint path with
a query string glued on — anywhere under `dev/**`/`ci/**`. Requiring a `/` before the `?` keeps the
rule off payload values (`-f 'body=Ready?'`) and jq's optional operator (`.foo?`), neither of which is
an endpoint. Use `-X GET` (which becomes mandatory once any `-f`/`-F` is present) plus
`-F name=value`/`-f name=value` instead, so each query value reaches `gh` as one opaque parameter
rather than interpolated text — unquoted, that lets a stray `&` background the shell command outright
(#10956), and even routed through `execFile` with no shell involved, still lets an interpolated value
silently inject an extra query parameter into the request.

Its sibling, `gh-api-requires-explicit-method.yml`, closes the other half of that same footgun: a
`gh api` argument array that carries `-f`/`-F` (short, long `--field`/`--raw-field`, or attached like
`-Fper_page=100`) but no explicit `-X`/`--method` token. `gh` defaults to POST whenever any such
parameter is present, so an endpoint meant to be read silently becomes a write — verified live against
a real repo, an unqualified `-F per_page=100` on the labels endpoint returned HTTP 422 attempting to
_create_ a label. The explicit-method check itself accepts both separated (`-X GET`, `--method GET`)
and attached (`-XGET`, `--method=GET`) forms — `gh` 2.96.0 parses both — mirroring how the `-f`/`-F`
detection already tolerates attached forms. `gh api graphql` calls are exempt: GraphQL has no GET
form, so `-f`/`-F` there always POSTs by design (#10956).

## Migration Artifact Cleanup

Migration-only AST-grep rules, tests, redirect stubs, and scaffolding are temporary. When the legacy surface is confirmed gone, remove those artifacts unless they still protect an active compatibility contract or invariant. Keep durable checks that enforce current behavior, such as route existence, auth boundaries, API contracts, or helper usage.

Decision checklist:

- Remove migration scaffolding when the old route, API, field, or import path no longer exists and the artifact only blocks references to the removed surface.
- Keep durable guardrails when they protect current behavior or a live compatibility contract, including auth boundaries, route existence, helper usage, API response shapes, cache invalidation, or data-integrity invariants.
- If both apply, narrow the check to the active invariant and delete stale migration-only examples, redirects, fixtures, and allowlist entries.

Example: after legacy entity admin routes were removed, the `web-no-migrated-admin-entity-url*` AST-grep rules and duplicate recursive web test were deleted. By contrast, `web-no-community-pending-post-href` remains because it protects the active community pending-post URL contract.

The table below covers checks that live under `static-code-analysis/`:

| Path                                                                       | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`docker-deploy/`](docker-deploy/)                                         | Docker-deploy helper scripts: pruning deployed runtime deps, restoring deployed workspace packages, pinning `.modules.yaml` `prunedAt` and clamping deployed mtimes so the runtime `node_modules` layer digest is stable, parsing the Dockerfile runtime `CMD`, parsing per-stage `node-prewarm` readiness ports (every `/prod/worker-*` prewarm stage must set `NODE_PREWARM_PORT` equal to its monitored `--port`). Forbidden heavy-module reachability (`sharp`, `@jongleberry/vurst-ai` unreachable from `api` and `worker-io` entrypoints) and API/worker-io `pnpm deploy` workspace-closure exclusions are enforced by the `forbidden-dependencies` and `forbidden-workspace-closure` rules in [`.no-mistakes.yml`](../.no-mistakes.yml) (#6908). Relative imports escaping a workspace package root (which break at runtime once `restore-deployed-workspace-packages.mts` relocates the package) are enforced by the `workspace-package-boundary-*` rules in [`backend/dependency-cruiser-rules/workspace-package-relative-import-boundaries.cjs`](../backend/dependency-cruiser-rules/workspace-package-relative-import-boundaries.cjs), run via `pnpm run dep-cruise:backend`. |
| [`config-inventory/`](config-inventory/)                                   | Generates `./dev/config-inventory` and enforces env-var, stale workflow env, DynamicConfig, docs cross-link, typed env-var docs drift, and package-manager gate inventory invariants for config migrations. It merges observed regex/text discovery with typed metadata from [`@ts-shared/env-contract`](../ts-shared/env-contract/); supported constant indirection comes from the typed contract instead of repo-wide string-alias scraping.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [`dependency-license-policy/`](dependency-license-policy/)                 | Parses `pnpm licenses list --json` SPDX expressions for every third-party dependency and denies a GPL/AGPL/EPL/CDDL/SSPL/BUSL match or an unlicensed/unknown package. `LGPL-3.0-or-later` (scoped to audited `@img/sharp-*` binary package families) and `MPL-2.0` (repo-wide) are allowlisted. See [Dependency License Policy](#dependency-license-policy) below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [`run-node-checks.mts`](run-node-checks.mts)                               | Batches all repo-local Node static checks; run via `node run-node-checks.mts --checks <comma-list>` in CI. `vouchington-tooling/shared-context` spawns `git ls-files` once per invocation and shares the tracked-file list across every check; `repo-file-policy` runs in a dedicated `worker_threads` Worker ([`repo-file-policy-worker.mts`](repo-file-policy-worker.mts) / [`repo-file-policy-worker-client.mts`](repo-file-policy-worker-client.mts)) so its heavier synchronous parsing doesn't block the other checks, and the parent passes its already-resolved `repoRoot`/`isInsideGitRepo`/tracked-file list into the worker via `workerData` instead of the worker re-spawning `git` for itself (issue #9050).                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| [`run-tooling-dependency-cruiser.mts`](run-tooling-dependency-cruiser.mts) | Owns the repo-tooling dependency-cruiser roots shared by local scripts, CI, and `ci-local`; callers may select content caching but cannot restate or omit roots.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| [`repo-file-policy/`](repo-file-policy/)                                   | Repo-wide application-specific policy for route/admin surfaces, Vitest placement, living-docs package pins, schema-doc drift, client parity, public-source deployment/maintainer literals (generic `account:` 12-digit fields report only with a same-file AWS event discriminator; `/home/` exemptions are the closed Linux user and application-segment lists), and remaining PostgreSQL invariants such as stored polymorphic targets, currency storage, UUIDv7 predicates, annotations, and stale allowlists. Test-source Git SHA pins plus generic Markdown, constraint, migration ADD COLUMN, config-driven DDL, file-universe, GitHub Actions persistent-workspace, and CI compiler-gate checks run through `no-mistakes` or `vouchington-tooling`.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [`scc-complexity/`](scc-complexity/)                                       | Runs pinned `scc` in separate product and repository-tooling scopes. Test/spec files, fixtures, and test helpers are excluded. Product code must stay below the configured limit; existing over-limit files under `.github`, `ci`, `dev`, and `static-code-analysis` are recorded at their current numeric ceilings in [`tooling-baseline.json`](scc-complexity/tooling-baseline.json). The shared runner rejects regressions plus malformed, duplicate, untracked, stale, and out-of-scope baseline entries. Remove an entry when its file reaches the normal limit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [`targeted-guardrails/`](targeted-guardrails/)                             | Narrow regression guardrails for known review misses that are cross-file doc/source sync checks, not single-file AST shapes: the Cloudflare Worker staging basic-auth exempt path/method source/runbook sync guard, and the Cloudflare Worker rate-limit Env binding reference-document sync guard. The nullable helper option-default and nullable web server entity-fetch heuristics that used to live here as hand-rolled AST walkers were migrated to the `nullable-options` pack rule and `server-entity-fetch-return-null` AST-grep YAML rule (single-file syntactic patterns fit the AST-grep tier; see [`../ast-grep-rules/`](../ast-grep-rules/) and the shipped `vouchington-tooling` pack).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

A nested `.oxlintrc.json` must restate two things from its `extends` ancestor by hand, verified
empirically against oxlint 1.76.0: (1) the root `"plugins"` array — a nested config that omits its
own `"plugins"` key falls back to oxlint's default plugin set rather than inheriting the ancestor's;
and (2) any ancestor `overrides` entry whose `"files"` glob depends on a path segment the nested
config's own directory sits inside (e.g. an ancestor's `"**/test-helpers/**"` override no longer
matches once a directory under `test-helpers/` gets its own config) — restate the affected rules
directly as the nested config's own top-level `"rules"`. See
[`backend/test-helpers/entities/.oxlintrc.json`](../backend/test-helpers/entities/.oxlintrc.json)
for a worked example. Both restatements are enforced by `structured-config-policy` in
[`.no-mistakes.yml`](../.no-mistakes.yml): `equals-file` preserves `"plugins"`, and
`ancestor-override-subset` preserves affected `overrides`. Root `jsPlugins` specifiers stay on
[`.oxlintrc.json`](../.oxlintrc.json). React Compiler diagnostics are native `react/*` rules
enabled from [`.oxlintrc.react.json`](../.oxlintrc.react.json); React/Next/JSX doctor _enables_
live there too. Generic `js-*` and security doctor rules stay at root.

Coverage fan-in consumers must use the bounded `ci/download-optional-run-artifacts.sh` probes and
leave terminal preparation/merge failures unsuppressed. Generic missing/over-cap job timeouts and
step-exceeds-job checks live in `github-actions-job-timeouts`. Workflow tests must not restate
`timeout-minutes` literals; that is `github-actions-test-timeout-literals`.

Repo-owned checks must skip gitignored and untracked files; see [CLAUDE.md](CLAUDE.md) for authoring rules. Generic filesystem rules such as backend alias mapping, config path references, local docs, shellcheck, extension policy, git identity mutation, lockfiles, package registry-only policy, workspace package.json coverage, queue/worker layout, Rust line-count, Rust no-inline-tests, CLAUDE.md / AGENTS.md size checks, and the binding-aware Vitest and Playwright call boundaries for real timers, fixed sleeps, and integration-test mocks are rules in `no-mistakes check` (configured via [`.no-mistakes.yml`](../.no-mistakes.yml)) and enforced in CI. Tracked `.patch` and `.diff` artifacts are banned by `banned-paths` in [`.no-mistakes.yml`](../.no-mistakes.yml) (case-insensitive globs). Pnpm `patchedDependencies` and `allowUnusedPatches` remain covered by `no-mistakes`. Fix the underlying problem upstream or file and link a Vouchington issue labeled `dependencies` instead of carrying a local patch. Offline Markdown local-link validation runs in static-analysis CI so deleting or renaming tracked files cannot leave stale docs links until the standalone online link workflow runs.

The lifecycle-scenario guard validates the Draft 2020-12 schema and code-owned family consumer
policy for `api-fixtures/v1/lifecycle-scenarios.json`. It rejects missing, duplicate, unknown, or
incompatible claims and requires each registered adapter's tracked evidence to consume the manifest
and dispatch its canonical adapter name.

The local-LLM endpoint-policy schema remains a shared producer contract at
`api-fixtures/v1/local-llm-endpoint-policy.json`. The external native client repository validates
its .NET, Swift-core, and Swift-Android consumers against that contract; see [Local LLM Endpoint
Policy Contract](../backend/test-helpers/api-fixtures/README.md#local-llm-endpoint-policy-contract).

The parser-backed
[`agent-blackboard-mcp-config.test.mts`](repo-file-policy/agent-blackboard-mcp-config.test.mts)
check keeps the shared `.mcp.json` and Codex `.codex/config.toml` Agent Blackboard registrations
tracked and equivalent across command, arguments, and forwarded environment-variable names. It
also prevents the Codex server from becoming required before fresh-worktree dependencies exist and
executes the tracked registration from a nested repository directory so the launcher cannot regain
a root-cwd assumption.

The `run:`-scalar extraction and shell-argument scanning that rejects an unquoted `?` or `&` in a
`gh api` argument was extracted to the published
[`vouchington-tooling/gh-api-shell-quoting`](https://github.com/vouchington/vouchington-tooling/tree/main/packages/vouchington-tooling/src/gh-api-shell-quoting)
module (issue #10956 follow-up, `vouchington-tooling#182`), since it carries no Vouchington-specific
identifiers. It scans across `.github/workflows/*.ya?ml`, `.github/actions/**/*.ya?ml`, and `ci/**/*.sh`, including
inside a `$(...)` command substitution — double quotes around the substitution do not quote what
happens inside it, so it tracks quote state for that nested context independently. An unquoted `&`
backgrounds the command, silently drops every parameter after it, and still exits 0 — `curl` is out
of scope because no in-repo call site takes a query string. A `&` immediately preceded by whitespace
is that background operator (or `&&`) ending an already-complete, fully-quoted command
(`gh api "repos/x/y" &`) and stops the scan; a `&` immediately preceded by `>` or `<` is a
file-descriptor-duplication redirect (`2>&1`, `>&2`) — pervasive in this repo's own `ci/*.sh`
scripts — and does not end the argument list, so scanning continues for a later unsafe argument on
the same logical line. A folded `run: >-` block scalar is joined into one line before the shell ever
sees it, and a quoted flow scalar (`run: '…'`/`run: "…"`) has its outer quotes stripped by YAML before
the shell ever sees it too — both are scanned via their decoded value rather than the raw source
slice, so a violation split across source lines (folding) or hidden behind quotes YAML itself removes
(flow scalars) is still caught; both report at the block's start line because decoding discards which
source line a given character came from. A `run:` value expressed as a YAML alias throws instead of
being silently skipped, since the scanner does not resolve aliases and a `run:` value has no reason to
be shared via an anchor. This is a regression tripwire over the current tree, not a general-purpose
shell parser: it does not track heredoc bodies (`<<'DELIM'`) as non-executed literal text, and a
leading-`&` redirect spelling (`&>`, `&>>`) is indistinguishable from the background operator, so it
also ends the scan early instead of continuing past it — since no tracked `gh api` call currently
sits inside a heredoc or after either redirect spelling, that and any other shell construct with no
in-tree instance is deliberately left unhandled rather than chased on review (#10956, #11027 review).

[`gh-api-shell-quoting.mts`](repo-file-policy/gh-api-shell-quoting.mts) re-exports that detection and
keeps only the Vouchington-specific file-classification policy local — which tracked paths count as a
shell script or a workflow/composite-action YAML file worth scanning — since `vouchington-tooling`
already ships its own unrelated file-classification module (`gha-workspace-policy`) and has no reason
to own this repo's layout. The shell-script file predicate matches `ci/**/*.sh` plus one named
allowlist entry, `ci/with-node-test-options`, the sole tracked executable shebang script under `ci/`
that doesn't end in `.sh`.
[`gh-api-shell-quoting-guard.mts`](repo-file-policy/gh-api-shell-quoting-guard.mts) wires this
detection into `checkRepoFilePolicy()` (`pnpm run repo-file-policy`, the "Repo Node static checks" CI
step), so an unquoted call fails that aggregator run rather than only a separate Vitest job; the
parser-backed [`gh-api-shell-quoting.test.mts`](repo-file-policy/gh-api-shell-quoting.test.mts)
exercises the same shared detection and file predicates directly (#10956).

The `production-dependency-declarations` rule in [`.no-mistakes.yml`](../.no-mistakes.yml) rejects a
production-reachable `backend`/`ts-shared` workspace file that imports a package its own
`package.json` does not declare under `dependencies`/`optionalDependencies`/`peerDependencies`
(#8871), catching both a
declared-but-dev-only import and an undeclared one before a filtered `pnpm deploy --prod` install
prunes it and the process throws `ERR_MODULE_NOT_FOUND` at runtime. A `dependency-cruiser`
`dependencyTypes: ['npm-dev']` rule cannot express this: pnpm symlinks resolve to in-repo realpaths,
so `isExternalModule()` never returns true and classification falls through to `undetermined` — see
the header comment in [`backend/.dependency-cruiser.cjs`](../backend/.dependency-cruiser.cjs).

PostgreSQL final-state inventories in `repo-file-policy` load the tracked, versioned
[`schema.json`](../backend/data-stores/psql/schema-snapshot/schema.json) once and fail closed when it
is missing, malformed, or stale-format. Migration authoring, deploy sequencing, inline directives,
and runtime query behavior remain source checks because the final catalog erases those facts. The
shared analysis context caches tracked-file contents. Parser-backed guards keep parsing bounded to
their own source analysis, share the resulting facts with cooperating checks, and discard ASTs instead
of retaining a repository-wide AST cache. Generated-column DML writes are enforced by `no-mistakes`
`postgres-no-generated-column-writes`, which parses `backend/data-stores/psql/migrations/**/*.sql`
and keeps only config-driven vote tables in `extraGeneratedColumns`. Snapshot freshness is verified
after migration by the database-backed CI schema phases.

Optional `.no-mistakes.yml` ignore and exclude entries have derived freshness checks: [`no-mistakes-config.test.mts`](../ci/no-mistakes-config.test.mts) derives ignored Playwright routes from the analyzer report, while [`no-mistakes-config-freshness.test.mts`](../ci/no-mistakes-config-freshness.test.mts) verifies provider/environment globs and filesystem exceptions against current repository state. Do not add a baseline or parallel exception registry. Provider annotation placement is documented in [Tests and Checks](../docs/development/tests.md#vitest-mock-typing).

Tests for static-analysis tooling should be covered by semantic Vitest projects in `vitest.config.mts`, not by a catch-all repo bucket.

SQL text guards under `repo-file-policy/` share PostgreSQL comment, quote, literal, and
statement handling through `sql-scanner.mts`, a re-export of `vouchington-tooling/sql-scanner`.
Guards that need migration `CREATE TABLE` metadata, or a full parse of a fragment, use
`sql-ast.mts`, a re-export of `vouchington-tooling/sql-ast` (`@libpg-query/parser@18`).
`extractPolymorphicTargetTables` stays local because it looks for `entity_type` / `entity_id`.
Squawk still owns generic SQL safety where it has rules; `postgres-no-add-column` owns migration ADD
COLUMN policy and its exact, stale-checked deployed-schema exceptions. New schema still belongs in
its original pre-launch `CREATE TABLE`.

Tracked config-driven INSERT replay-safety, correlated `EXISTS` set-operation shapes, and the
active-topic filter (`deleted_at IS NULL` and `merged_into_topic_id IS NULL`) live in
[`.no-mistakes.yml`](../.no-mistakes.yml) as `postgres-idempotent-insert`,
`postgres-sql-shape-policy`, and `postgres-required-predicates`. Suppress with
`no-mistakes-disable-next-line <rule>`. TypeScript-generated config-driven SQL that those `.sql`
files never contain is still judged at test time by
`backend/test-helpers/data-stores/psql/config-driven/generated-ddl-insert-invariants.mts`.

## Where To Put A New Rule (Priority Order)

Always pick the highest tier that can express the rule. See the [Guard Authoring Checklist](#guard-authoring-checklist) before implementing a new or changed guard, and use #4988 as the context for why static-analysis rules should stay small and focused.

0. **Decide whether this is an anti-pattern or a style preference.** If the rule is prescriptive style or "how we prefer to code," do not add a check; document the convention instead. Only real bug, safety, drift, or foot-gun anti-patterns justify a guard.
1. **Off-the-shelf tool config.** Configure an existing tool and write zero custom rule code. Reach first for oxlint built-ins and plugins, `dependency-cruiser` for boundaries and cycles, `knip` for unused exports/dependencies/files, `tsc` strict options, `syncpack` for dependency versions, `squawk` for SQL/migrations, `oxfmt`, and `selene`. The pnpm workspace dependency graph is the source of truth for dependency edges; `knip` (automatic resolution) plus per-workspace typecheck enforce that declared dependencies stay accurate. Expose CLI-only dependencies through package scripts so Knip can trace them. Reserve workspace-scoped `ignoreDependencies` for runtime or tool configuration strings Knip cannot trace, not as a substitute for declaring an edge.
2. **AST-grep YAML rule.** Use this for single-file syntactic patterns: banned shapes, required shapes, and path-scoped rules controlled by `files` / `ignores`. Keep it declarative; do not add AST-walking Node code when a YAML rule can match the shape. Unconditional, product-identifier-free rules belong in the `vouchington-tooling` pack (`vouchington ast-grep-pack` / `astGrepPackPaths()`). Product-specific or helper-coupled rules stay in [`../ast-grep-rules/`](../ast-grep-rules/).
3. **`no-mistakes` rule.** Use this for cross-file, filesystem, or app-graph invariants, and for anything generic enough to apply outside this repository. Prefer declarative `.no-mistakes.yml` config rules. Use `eslint-plugin-no-mistakes` for generic AST checks. Upstream-first: if the concept is not Voucha-specific, implement it in the upstream `no-mistakes` package and configure it here instead of writing a repo-local parser.
4. **Custom Node check in [`run-node-checks.mts`](run-node-checks.mts).** Avoid this tier. Use it only for repo filesystem invariants that `no-mistakes` cannot yet express, and prefer upstreaming the needed capability to `no-mistakes` first.

Custom logic under this directory should be minimal. When a proposed rule starts accumulating broad baselines, path tables, or control-flow special cases, stop and reassess whether the rule belongs in a higher tier or should be narrower.

## Guard Authoring Checklist

Before first push for a new or changed policy rule:

- Cover the adversarial matrix: static imports, type-only imports, `require`, dynamic imports, aliases, namespace/member aliases, object spreads, rest destructuring, nested destructuring, and partial mocks when relevant.
- Before replacing a parser, tokenizer, serializer, or format library, follow the [Parser and Library Swap Checklist](../docs/checklists/parser-library-swap.md). Add characterization fixtures before changing internals so malformed-but-accepted input, quoting, scalar coercion, offsets, and fallback behavior stay intentional.
- **AST coverage checklist** — before first push, verify the rule handles each AST shape that can carry the banned or required pattern: route/string literals (bare string, template literal, tagged template), JSX attributes (`prop="val"` and `prop={expr}`), JSX element names, array element positions, object property keys and values, and arrow/function bodies. Missing one is the most common source of post-merge follow-up commits.
- Parser-backed guards need direct parser-output tests for every returned field and each meaningful table or shape, plus negative tests proving unrelated references are not conflated.
- Analyzer migrations need runner-parity fixtures before first push: prove source-level intent and effective severity match every entrypoint that will enforce the analyzer, including package scripts, no-mistakes per-file runners, and CI.
- Dependency-cruiser migrations must test the resolved installed `to.path`, including PNPM's versioned `.pnpm` segment, with one positive violation and one near-miss against the exact CI cruise before deleting the old guard.
- Repo-wide file guards need at least one fixture outside the first obvious directory, such as backend Markdown for Markdown guards, so scan scope regressions fail locally.
- Tests that only inspect repository-root filesystem paths and do not import workspace code belong
  under `static-code-analysis/`, not a workspace Vitest project that requires initialized build output.
- For source-content assertions that require an export, match the export shape (for example,
  `/\bexport\b[^\n]*\bsymbolName\b/` for a single-line export) instead of using
  `content.includes('symbolName')`, which also matches imports, comments, and string literals.
- Workflow-trigger helpers should live in `.github/workflows/workflow-test-helpers.mts` and cover scalar, array, and mapping `on:` shapes, `push` `branches` / `branches-ignore` handling, branch matching, and `workflow_run.workflows` extraction.
- Custom language-control-flow and preprocessor guards need characterization fixtures for branch states such as `#if`, `#elif`, `#else`, parenthesized conditions, negation, and unrelated symbols before relying on the parser.
- Include one positive fixture and one negative fixture for every new branch, with exact human-facing diagnostics and minimal passing protected surfaces.
- For new parser, guard, or provider-field checks, cover boundary states (empty, null, unknown/sentinel, multi-byte where relevant) and make malformed input return safe sentinels (`[]`/`null`) instead of throwing.
- For AST-grep rules: add at least one `isValid: false` and one `isValid: true` example in the rule YAML's `examples:` block, with `file:` paths that match and do not match the rule's `files:`/`ignores:` globs. These are executed by `vouchington ast-grep-examples`. When the rule uses regex alternation, test with a **multi-argument factory call** (e.g. `factory(argA, argB)`) — alternation can over-consume arguments and produce false negatives.
- Add malformed-input and real-repo missing-file fixtures when the rule reads files or paths.
- Use oxfmt-shaped Markdown/table fixtures; do not make regexes depend on hand-aligned single-space table padding.
- Keep allowlists precise and explain each suppression class with examples.
- When review catches a pattern class, add local fixtures for the whole class before pushing again.

**AST-grep specific footguns** — before first push on a new or changed YAML rule, verify each of these:

1. **Missing `stopBy: end`** — without `stopBy: end` on a traversal node, the matcher stops at the first child match and misses sibling nodes. Add it on any `has`/`inside`/`follows`/`precedes` clause that must traverse the full subtree.
2. **Self-closing JSX needs a separate arm** — `kind: jsx_opening_element` does not match `<Foo />`. Add a `kind: jsx_self_closing_element` alternative alongside any opening-element arm.
3. **Parse `.ts`/`.mts`/`.cts`/`.tsx` as `Tsx`** — ast-grep assigns one parser per file. This repo's `sgconfig.yml` maps those extensions to `Tsx` so one YAML rule can list both `**/*.ts` and `**/*.tsx` in `files:`. Do not add `-tsx` companion files. Keep JSX-only rules on `web/**/*.tsx`. Angle-bracket type assertions (`<T>value`) are not valid TSX; use `as`.
4. **Catch-block rules must continue traversal, not early-return** — a rule body that returns from a catch block skips all sibling nodes in that scope. Set a flag inside the catch and check it after the block instead.
5. **Fixtures must mirror real invariants** — use actual codebase patterns in `isValid` examples, not rule-shaped toy code. Rule-shaped fixtures can match the rule without catching real-world variants that would slip past. Pull examples from existing files in the repo.
6. **Run `ast-grep scan --rule <rule>.yml .` against the real repo before push** — zero hits on a new enforcement rule is a red flag. Either the rule is too narrow to catch real violations, or a `files:` glob is mis-scoped. Debug before shipping.
7. **Rust `regex` — no lookaheads, lookbehinds, or backreferences** — ast-grep
   uses the Rust `regex` crate, which **does not support** lookarounds (`(?=…)`,
   `(?\!…)`, `(?<=…)`, `(?<\!…)`) or backreferences (`\1`). These silently fail
   to compile or under-match with no useful diagnostic. **Supported:** `\b` word
   boundaries, non-capturing groups `(?:…)`, character classes, anchors `^`/`$`,
   and alternation `|`. **Workaround:** replace a lookahead with a consuming
   pattern plus a `not:` constraint, or split the rule into multiple arms.
   ```yaml
   # ✗ Rust regex does not support lookahead:
   regex: 'createClient(?=\()'
   # ✓ Consume the paren instead, then assert via `not:` or a `has:` child check:
   regex: 'createClient\('
   ```

Useful targeted preflights:

- `pnpm exec ast-grep scan --no-ignore hidden --off=unused-suppression --rule ast-grep-rules/<rule-id>.yml` for one AST-grep rule.
- `node static-code-analysis/run-node-checks.mts --checks repo-file-policy,scc-complexity,targeted-guardrails` for file-policy, code complexity, and targeted regression guards.
- `pnpm exec vitest run --project static-analysis-tools <changed static-analysis tests>` for repo-owned static-analysis tests.
- `pnpm run ast-grep` for AST-grep rule examples; `pnpm exec vitest run --project static-analysis-ast-grep` for Tsx `languageGlobs` and rule-language contract.

## Rolling Out A Repo-Wide Guard

When a new or tightened guard flags many existing files, **split the rollout into two PRs** to keep blast radius manageable:

**PR 1 — introduce the guard:**

- Add the rule, wire it into `static-code-analysis.yml`.
- Seed an external baseline/allowlist file (preferred) or, when the runner supports non-blocking warnings, set the guard to warn-level so existing violations do not fail CI.
- The PR should be small: the guard code, CI wiring, and the baseline file. No broad remediation.

Oxlint is an exception to the warn-level option. The root `package.json` script and
`.github/workflows/static-code-analysis.yml` run Oxlint with `--deny-warnings`, so warnings fail
the same check as errors. The `.husky/commit-msg` hook also prints the equivalent scoped command
as a required before-push check; it does not execute Oxlint itself. Stage an existing Oxlint
backlog with an explicit `"off"` entry that links its remediation issue and records the measured
scope and its scan date, then move the rule directly to `"error"` when remediation lands. Do not
add a repository-owned baseline for an off-the-shelf Oxlint rule; Oxlint has no baseline
mechanism, so stage the rule `"off"` with a linked remediation issue instead.

Measuring a staged jsPlugin rule with `oxlint -D plugin/rule` does not reliably override an
explicit `"off"` entry. Builtin eslint/typescript/unicorn `-D` scans can show real hit counts;
react-doctor, playwright, and you-might-not-need rules can report a false zero until the config
sets the rule to `"error"` and a full `pnpm exec oxlint --type-aware --deny-warnings` run
confirms the count. Always verify a jsPlugin enable with that config change before treating the
rule as clean.

`no-mistakes/no-inline-noop-promise-catch` is enforced for production `backend/**` and `web/**`
under [`../.oxlintrc.json`](../.oxlintrc.json). Its four test-helper/test-file exclusions keep
test-only rejection swallowing out of the production inventory. The authoritative 2026-09-10 scan
found 116 diagnostics in 70 production files (41 backend, 75 web); #11566 introduced the consumer
contract and inventory, #11567 remediated and promoted backend, and #11568 remediated web and
expanded the final error-level scope. The fixture runs the installed package rule directly,
rejects
empty/bare-return/`undefined`/`void` callbacks and `.then()` rejection handlers, and accepts named,
logging, and rethrow handlers without a callee allowlist.

**PR 2 — remediation (after PR 1 merges):**

- Remove baseline entries or fix violations in bulk.
- Because the guard is already green in CI, reviewers can verify the guard behavior is correct before the remediation lands.

This is the pattern tier 4 already requires ("do not put large baseline or allowlist arrays inside `.mts` rule files; externalize generated data"). PR #5415 (`scc-complexity` guard + 71-file refactor in one PR) is the motivating counter-example.

**Signal to split:** when the guard diff is large (many flagged files), the blast radius itself is the signal — keep PR 1 small by externalizing the baseline, and land the bulk remediation in PR 2 after the guard behavior is confirmed. A good heuristic: if the guard flags >10 existing files, split; if it flags 3–5 and remediation is straightforward, a single PR is fine.

**When splitting is not necessary:** if the guard flags zero existing files (the violation pattern is new), or if remediation is 3–5 files, a single PR is fine.

## Off-the-shelf Tool Migration Evaluation (#5044)

This section records the outcomes of the evaluation in #5044 so the tracking issue can close.

### Migrated to off-the-shelf tools

- **`backend-runtime-audit/` heavy-module reachability → `no-mistakes`**: `sharp` and
  `@jongleberry/vurst-ai` must be unreachable from the `api` and `worker-io` entrypoints.
  Originally moved to `backend/dependency-cruiser-rules/entrypoint-forbidden-reachable.cjs`
  using dependency-cruiser's `to.reachable: true` forbidden rules (#5044); that rule file (and 4 dead
  npm-path rules in `package-boundaries.cjs` that never matched pnpm store realpaths) were deleted and
  replaced by the `forbidden-dependencies` and `forbidden-workspace-closure` rules in
  [`.no-mistakes.yml`](../.no-mistakes.yml) (#6908). The list also guarded `darkpanda` and
  `lightpanda.mts` (the local-spawned Lightpanda binary's driver) until the Lightpanda SaaS
  migration deleted both outright, so there is nothing left to forbid. Reproduce with
  `pnpm run no-mistakes`.
- **`repo-file-policy/` test email, integration-test no-mock, and markdown link display-text guards → `no-mistakes`**: these checks are configured in [`.no-mistakes.yml`](../.no-mistakes.yml) instead of the repo-local custom policy code.
- **`repo-file-policy/skill-discovery-guard.mts` → `no-mistakes` `finite-set-consistency`**: the flat 1:1 Claude skill-discovery mapping (`.agents/skills/<name>/SKILL.md` ↔ `.claude/skills/<name>`) is the `Claude skill discovery set consistency` `path-regex-capture` equal-set rule in [`.no-mistakes.yml`](../.no-mistakes.yml). Unblocked by no-mistakes 0.44.0 / [no-mistakes#663](https://github.com/jonathanong/no-mistakes/pull/663), which includes directory-target and broken tracked symlinks in `path-regex-capture`. Reproduce with `pnpm run no-mistakes`.
- **Markdown parsing for repository guards → `vouchington-tooling/markdown`**: the shared package
  owns GFM parsing, traversal, table extraction, and heading-bounded sections. The moderation
  policy doc-sync extractors compose those primitives by domain; do not add repo-local remark
  processors or copied AST walkers.
- **Config-driven schema DDL bans → `no-mistakes` `postgres-sql-statement-policy`**: the parser-backed
  rule owns CREATE/ALTER/TRUNCATE/DROP statement policy, including executable `DO` bodies.
  Reproduce with `pnpm run no-mistakes`.
- **Config-driven INSERT replay-safety, correlated EXISTS shapes, and the active-topic filter →
  `no-mistakes` 0.57.1**: `postgres-idempotent-insert` owns ON CONFLICT / conjunctive `NOT EXISTS`
  presence plus convergent `DO UPDATE`, volatility, arbiter identity, trigger replay, and generated
  arbiter sources (`replaySafeTriggerFunctions` /
  `triggerWrittenColumns` stay in [`.no-mistakes.yml`](../.no-mistakes.yml)).
  `postgres-sql-shape-policy` bans unrestricted `EXISTS (… UNION …)`.
  `postgres-required-predicates` requires `deleted_at IS NULL` and `merged_into_topic_id IS NULL` on
  `topics` queries. The local `config-driven-sql-guard` / `on-conflict-*` /
  `topics-active-filter-guard` copies are deleted. TypeScript-generated config-driven SQL is still
  judged at test time by `generated-ddl-insert-invariants.mts`.
  Reproduce with `pnpm run no-mistakes`.

### PostgreSQL Conflict Ordering

- **Catalog-backed PostgreSQL conflict and lock order → `no-mistakes` 0.59.0**:
  `postgres-conflict-ordering` resolves production multi-row UPSERTs across backend runtime code and
  deploy-time config-driven SQL against the committed v2 schema snapshot. It requires the conflict
  target and source `ORDER BY` to begin with the same unique-index key sequence. The
  catalog-backed `postgres-lock-ordering` configuration applies that prefix to multi-row row locks,
  while the repository-wide configuration continues to require deterministic ordering. Tests, test
  helpers, and fixtures are excluded; migrations, views, manually invoked scripts, and EXPLAIN data
  generators remain outside the production include paths. Dynamic SQL that reaches the parser fails
  closed. The current upstream analyzer cannot recover wholly opaque executor arguments, so this
  rollout pairs a manual production-writer audit with an exact, test-enforced inventory of narrow
  directives used only when ordering is enforced outside the analyzable statement. Reproduce with
  `pnpm run no-mistakes`.
- **`repo-file-policy/` `ALTER TABLE ADD CONSTRAINT ... NOT VALID` requirement → squawk
  `constraint-missing-not-valid`**: squawk already lints all three SQL globs (`migrations/`,
  `config-driven/`, `views/`) via the `squawk` script in `package.json` and directly in CI (see
  [`tests-postgres-schema.yml`](../.github/workflows/tests-postgres-schema.yml)), and that rule is not
  in `.squawk.toml`'s `excluded_rules`. The redundant "must use NOT VALID" branch in
  `migration-sql-guard.mts` (which only ever scoped to `migrations/`) was removed. Named
  `NOT VALID` ↔ `VALIDATE CONSTRAINT` pairing now lives in `postgres-constraint-validate`, while
  `postgres-require-named-constraints` owns explicit ADD CONSTRAINT names.
- **Config-format parsing helpers → format parsers**: `config-inventory/package-gates.mts` parses
  `pnpm-workspace.yaml` with `yaml`, no-mistakes `version-pin-consistency` parses
  `.mise.toml`, and `docker-deploy/dockerfile-runtime-cmd.mts` and
  `docker-deploy/dockerfile-prewarm-ports.mts` parse Dockerfile instructions through
  `vouchington-tooling/dockerfile-parse`.
  The repo checks keep their Voucha-specific structural assertions while delegating YAML, TOML, and
  Dockerfile syntax to maintained parsers.
- **Package manifest policy → `no-mistakes`**: `workspace-package-cycles` walks the
  **package.json workspace-dependency graph** (declared
  `workspace:^` deps between packages) for cycles. `dependency-cruiser` `no-circular` walks the
  **module import graph** instead — a different graph, since a workspace-package cycle can exist
  without a module-import cycle (e.g. two packages that both list each other as `workspace:^` but only
  one imports the other) — so migrating to `no-circular` was never an option. `pnpm-workspace.yaml` sets
  `disallowWorkspaceCycles: true`, but CI's `pnpm install` passes
  `--config.disallow-workspace-cycles=false` (`vouchington-tooling/pnpm-install`), so this lint-level rule
  remains the only CI-enforced guard against workspace-package cycles. Verified against the pinned
  `no-mistakes` Rust source that the rule is a strict superset of the removed check: same graph model,
  an SCC-based all-cycles scan (vs. the removed check's first-cycle-found DFS), and the rule's default
  `dependencyTypes` used as-is (adds `peerDependencies`; verified zero workspace-name peer deps exist
  today). The finding location is now the first package manifest in the cycle (previously every
  manifest), though the diagnostic message still names every package in the cycle (e.g.
  `A -> B -> A`). Configured in [`.no-mistakes.yml`](../.no-mistakes.yml). Version/specifier policy still
  lives in syncpack (`.syncpackrc.json` version groups and `semverGroups`). Reproduce with
  `pnpm run no-mistakes`. `package-json-required-fields` and `structured-config-policy` own
  manifest field shape, workspace validation dependencies, and application-specific name pins.
  `package-json-nested-workspace-coverage` requires explicit nested workspaces to exactly match
  `@ts-shared/*` dependencies beneath backend, web, Cloudflare Worker, and Lambda roots.
  `pnpm-overrides-ban` flags `pnpm-workspace.yaml` top-level `overrides`, package.json top-level
  `overrides`, and `pnpm.overrides`; `packageExtensions` remains allowed. Version/specifier policy
  stays in Syncpack.
- **`repo-file-policy/` package.json / `pnpm-workspace.yaml` coverage → `no-mistakes`
  `package-json-workspace-coverage`**: the deleted `isWorkspacePackageJson` loop compared every
  tracked `package.json` against a hand-maintained EXACT set and regex PATTERNS that had already
  drifted from live `pnpm-workspace.yaml` (`integration-tests/*`, `rust/packages/*`, over-broad
  `backend/entrypoints/*`). The replacement rule reads the yaml directly. `requireNamedPackage` is
  omitted on purpose: at pinned no-mistakes 0.43.2 that flag skips unnamed/`{}` manifests instead of
  requiring a `name`. `packageRoots` lists every tracked top-level directory.
  Reproduce with `pnpm run no-mistakes`.
- **`repo-file-policy/` FK supporting-index, markdown-eval tests, patch/diff paths, generic CI job
  timeouts, and named constraint pairing → `no-mistakes` 0.46.1**: `postgres-fk-index` (with
  `allowDirective: fk-index-guard-allow` and enumerated SET NULL audit `allowedColumns`),
  `markdown-eval-tests`, case-insensitive `banned-paths` for `*.patch`/`*.diff`,
  `github-actions-job-timeouts` (`maxMinutes: 10`, `rejectStepExceedingJob`), `markdown-child-links`
  for split-requirement parents, and `postgres-constraint-validate`. `postgres-require-fk-on-delete`,
  `postgres-require-named-constraints`, and `postgres-no-add-column` now own the remaining generic
  migration constraints. Local leftovers are canonical-link syntax (`- <a id=…></a>[text](file.md)`)
  and composition helpers (#9738) and product-specific polymorphic-target and edited-in-place
  migration policy. The `#9742 leftover` coverage-transport/consumer exact-budget guard was removed
  outright once the S3 coverage-transport it budgeted for was reverted; `github-actions-job-timeouts`
  now covers those jobs generically.
  Reproduce with `pnpm run no-mistakes`.
- **Test Git revisions and sparse checkouts → `no-mistakes` 0.53.0**: the package-owned
  `no-test-git-sha` rule scans Vouchington test and fixture surfaces, retaining only narrow null-ref
  and historical GitHub-link contexts in `.no-mistakes.yml`; `no-sparse-checkout` parses both
  GitHub Actions directories and `ci/no-mistakes-workflows/`. The local repository-policy guards
  and their generic fixture suites are deleted. Reproduce with `pnpm run no-mistakes`.
- **`oxlintrc-policy/` and six 0.47.0 engines → `no-mistakes`**: nested oxlintrc `"plugins"`
  `equals-file`, `not-single-file` after stripping `**/`, override `.bind` `match: any`, plus
  `tsconfig-file-coverage`, `version-pin-consistency`, `no-raw-ephemeral-port`,
  `github-actions-test-timeout-literals`, `github-actions-action-timeout-pair`, and
  `postgres-redundant-index`. The local `oxlintrc-policy/` directory and the replaced
  `repo-file-policy` / ast-grep copies are deleted. See #9735 / #9858.
  Reproduce with `pnpm run no-mistakes`.

### Kept custom (evaluated, cannot migrate)

- **`post-publication-reader-inventory`**: validates the tracked JSON inventory of every public
  post reader. `pr2_baseline` must remain empty; public SQL readers must import and call the
  canonical public predicate, output boundaries must compose canonical ID revalidation, and direct
  readers must use the direct predicate or batch access gate. Exceptions are classified with their
  boundary evidence. See [Public Post Eligibility](../docs/overview/architecture/reference-post-lifecycle-public-eligibility.md).

- **`config-inventory/` observed env-var discovery**: typed metadata now lives in
  [`@ts-shared/env-contract`](../ts-shared/env-contract/) and feeds Vouchington config-inventory.
  The separate private infrastructure repository receives deployment changes through a manual
  handoff; it is not an automated consumer of this package. Config-inventory intentionally keeps regex/text scanning as the observed-usage
  audit layer so it can still find readers, docs, workflow env declarations, Docker build args,
  package gates, and stale or undocumented env names outside the contract.
