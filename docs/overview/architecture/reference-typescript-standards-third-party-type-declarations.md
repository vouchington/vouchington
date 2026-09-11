# TypeScript Standards reference

[Back to TypeScript Standards](typescript-standards.md)

## Third-Party Type Declarations

Use a dependency's bundled declarations when available. If it does not bundle types, prefer its
maintained `@types/*` package in the owning workspace. A repository-owned ambient declaration is a
last-resort boundary: keep it in the nearest shared type root, expose only the members the repository
uses, avoid `any`, and guard its exact type surface with a type-only contract test. Do not add
runtime tests for dependency behavior. Delete ambient declarations when
bundled or maintained types become available.

The retained backend inventory and its verification guidance live in
[`backend/types/README.md`](../../../backend/types/README.md#ambient-third-party-boundaries). It
contains the narrow `http-assert` callable contract, the consumed `sql-template-strings` statement
surface, and the test-only `VitestLooseMock` global. The worker-owned `cloudflare:workers` boundary
is defined in
[`cloudflare-worker/src/cloudflare-workers.d.ts`](../../../cloudflare-worker/src/cloudflare-workers.d.ts),
whose upstream type sentinel is checked by the Worker typecheck.

### Ambient declaration audit (#7960)

The July 2026 audit classified every third-party ambient declaration in scope. A retained boundary
must encode a narrower, mechanically verified contract than the available upstream declaration.

| Candidate                                           | Disposition | Evidence and rationale                                                                                                                                                                                                                                            |
| --------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/services/notifications-push/web-push.d.ts` | Removed     | Replaced by the maintained `@types/web-push` package in the owning workspace.                                                                                                                                                                                     |
| `backend/types/debug.d.ts`                          | Removed     | No source import or declaration consumer remained.                                                                                                                                                                                                                |
| `backend/types/http-assert.d.ts`                    | Retained    | Exposes only the required callable assertion signature; a type-only contract test verifies it.                                                                                                                                                                    |
| `backend/types/lingua-rs.d.ts`                      | Removed     | Replaced by `lingua-rs`'s bundled types. Native installation was resolved separately by [#7809](https://github.com/jonathanong/filaments/issues/7809).                                                                                                            |
| `backend/types/pg-iterator.d.ts`                    | Removed     | No source import or declaration consumer remained.                                                                                                                                                                                                                |
| `backend/types/random-mobile.d.ts`                  | Removed     | The dependency was removed in favor of a bounded native `crypto.randomInt` generator and phone-number acceptance tests.                                                                                                                                           |
| `backend/types/sql-template-strings.d.ts`           | Retained    | Exposes only the callable tag and statement members the backend consumes; a type-only contract test verifies it.                                                                                                                                                  |
| `ci/no-mistakes-playwright.d.ts`                    | Removed     | After `no-mistakes` 0.32.0, the report is accepted as `unknown` and validated before its `edges` are read. [#7799](https://github.com/jonathanong/filaments/issues/7799) was separately closed by [PR #7971](https://github.com/jonathanong/filaments/pull/7971). |
| `cloudflare-worker/src/cloudflare-workers.d.ts`     | Retained    | The narrowed runtime class is intersected with an upstream sentinel that instantiates `WorkerEntrypoint<Env, Props>` and verifies its constructor environment and inferred props slots; upstream name or generic-boundary drift fails the worker typecheck.       |

Use this hidden-aware scan for future audits:

```sh
rg -l --hidden --glob '*.d.ts' --glob '!node_modules/**' --glob '!.git/**' '^\s*declare (module|global)\b' .
```

Before the audit, the scan returned 10 files: all nine candidates plus the unrelated
`web/css.d.ts`. After the audit, it returns four files: `web/css.d.ts` and the three retained
candidates. The candidate batch therefore moved from nine ambient declarations to three.

## Additional Oxlint Rules

- `pnpm run oxlint` runs oxlint in type-aware mode through `oxlint-tsgolint`, so the TypeScript
  rules that require compiler information run in the same static analysis pass as the syntax-only
  rules. The full-repo type-aware run is part of CI; keep that run reliable before promoting
  additional type-aware-only rules or stricter severities.
- `.bind()` member access is banned by `no-restricted-properties`. Prefer direct method calls.
  When a receiver must be preserved, use a named helper that calls the method directly on its owner
  instead of creating a bound function.
- `max-lines` is enforced as a source/test hard ceiling so large files remain visible without
  maintaining a per-file exception baseline. Source files are capped at 200 lines, and test/spec
  files are capped at 300 lines. Repository config files are outside this source/test policy.
  Split oversized modules into focused helpers instead of adding file or pattern exemptions; test
  files must not disable the `max-lines` rule.
- `typescript/no-unnecessary-type-arguments: "warn"` — catches redundant generic args that repeat a parameter's default type (e.g., `Container<number>` when `interface Container<T = number>`)
- `typescript/no-redundant-type-constituents: "warn"` — catches `string | never` (→ `string`) or `any | string` (→ `any`)
- JSX prop allocation rules (`react-perf/jsx-no-new-{array,object,function}-as-prop`) are
  intentionally `"off"` because React Compiler memoises inside every component automatically.
  See `web/CLAUDE.md` for the full policy and the narrow exceptions (context Provider values,
  callback refs).
- Native React Compiler rules (`react/purity`, `react/refs`, and the other per-category compiler
  rules) and web-only React Doctor rules are enabled by `web/.oxlintrc.json`; shared React hook
  rules live in `.oxlintrc.react.json`. Web lint includes tests and stories even though their
  runtime transforms do not run React Compiler. Email templates inherit only the shared rules.

## Test Mock Linting

Vitest module mocks should use typed dynamic imports, such as
`vi.mock<typeof import('./module.mts')>(import('./module.mts'), () => ({ ... }))`, so mock
factories stay aligned with the module's real export shape.
