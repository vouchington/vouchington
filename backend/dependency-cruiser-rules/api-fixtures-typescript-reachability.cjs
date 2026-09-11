'use strict'

// This rule's coverage of api-fixtures/*.test.mts contract tests depends on an external
// exclusion: backend/.dependency-cruiser.cjs's `doNotFollow.path` must anchor its
// `(\.test|\.spec)\.mts$` alternative as `^(?!.*api-fixtures/).*(\.test|\.spec)\.mts$` (see that
// file's comment for why) so those test files are followed at all -- doNotFollow stops
// dependency-cruiser from resolving a matched module's own imports, so an unanchored exclusion
// would silently hide any *.test.mts file's `typescript` import from this rule entirely, not
// exempt it via `from.pathNot` below. This rule is not self-contained with respect to that
// upstream config; it is defined here only for organizational adjacency to the other exemptions.
//
// dependency-cruiser's `to.path` can only express module-graph reachability -- it has no
// way to see which named members of a module are used, so unlike
// oxlint-plugin/typescript-program-construction.cjs it cannot distinguish "imports typescript
// to construct a program" (banned) from "imports typescript as a runtime value for type
// inspection, e.g. ts.isInterfaceDeclaration(...) / ts.SyntaxKind" (legitimate). Every file
// below already does the latter as of this rule's introduction (verified via `pnpm run
// dep-cruise:backend` -- none use `import type`, so `dependencyTypesNot: ['type-only']`
// cannot separate them either). This is a closed, non-growing allowlist (a ratchet, not a
// grandfather clause): do NOT add new entries here, except a pre-existing importer that only
// became visible after a doNotFollow fix closed a blind spot in this rule itself -- see the
// dated addition below for the one case where that has happened so far. The call-level
// FACTORIES precision that actually enforces the "construction only in backend-program.mts" invariant continues to be
// covered by oxlint-plugin/typescript-program-construction.cjs, which stays active in
// parallel -- this rule only adds a coarser reachability backstop against *new* files. This is
// deliberately stricter than the oxlint invariant for genuinely new files: oxlint permits a new
// type-guard-only consumer anywhere, while this rule hard-fails any new file that reaches
// `typescript` at all. A developer hitting that failure for a legitimate type-guard-only need
// should reuse an existing consumer above rather than write a new one, or raise loosening this
// ratchet as its own reviewed change (not a silent allowlist addition) if reuse genuinely isn't
// possible.
//
// 'response-contract-registry.test' and 'backend-program-freshness.test' (note the literal
// `.test` segment baked into the entry itself, escaped by RegExp.escape below along with the
// rest of the string) were added after fixing a doNotFollow gap in backend/.dependency-cruiser.cjs
// that previously hid every *.test.mts file in api-fixtures/ from this rule entirely. Both
// test files import `typescript` directly and were flagged the moment that gap was fixed;
// both were individually verified (grep for `ts\.(create|Program|LanguageService|BuilderProgram|
// SolutionBuilder)`, zero hits in either) to use it only for type/enum values (ts.CompilerOptions,
// ts.ModuleKind, ts.isCallExpression, etc.), the same as their production siblings below.
const LEGITIMATE_TYPE_GUARD_CONSUMERS = [
  'response-contract-status',
  'response-contract-route-analysis',
  'response-contract-registry',
  'response-contract-registry.test',
  'response-contract-registration',
  'response-contract-media',
  'response-contract-implicit',
  'response-contract-error-branch',
  'request-contract-route-analysis',
  'request-contract-registry',
  'request-contract-implicit',
  'registered-route-catalog',
  'query-contract-registry',
  'query-contract-extraction',
  'backend-program-freshness.test',
]

// Entries above are interpolated into a RegExp string below; escape regex metacharacters so a
// future ratchet-list addition can never silently change the pattern's matching semantics (e.g. a
// stray `.` or `+`) instead of raising a plain "no match" -- structural safety instead of relying
// on the "hyphen-safe names only" convention implied by the list's naming so far.
/** @type {import('dependency-cruiser').IForbiddenRuleType} */
const noApiFixturesTypescriptReachability = {
  name: 'no-api-fixtures-typescript-reachability',
  comment:
    'backend/test-helpers/api-fixtures/* must not directly import the typescript module ' +
    '(see the `to:` block comment below for why this is direct-edge-only, not transitive). Only ' +
    'backend-program.mts (loadBackendProgram()) ' +
    'may construct TypeScript compiler hosts, programs, and language services. Existing ' +
    'non-construction consumers (see LEGITIMATE_TYPE_GUARD_CONSUMERS) are grandfathered; new ' +
    'files are not.',
  severity: 'error',
  from: {
    path: '^backend/test-helpers/api-fixtures/',
    pathNot: [
      '^backend/test-helpers/api-fixtures/backend-program\\.mts$',
      `^backend/test-helpers/api-fixtures/(?:${LEGITIMATE_TYPE_GUARD_CONSUMERS.map(RegExp.escape).join('|')})\\.mts$`,
    ],
  },
  to: {
    // Deliberately direct-edge-only, not `reachable: true`: a prior draft of this rule used
    // `to: { reachable: true, path: ... }` to also catch a new api-fixtures file that imports
    // typescript only through an intermediate helper (transitively, not directly). That was
    // empirically rejected -- with `reachable: true` the rule produced 15 false positives across
    // this codebase's existing api-fixtures/*.mts, because dependency-cruiser's transitive
    // reachability check does not stop at the direct-import boundary this rule is scoped to; it
    // flags any file that can reach `typescript` through any chain of imports, which is nearly
    // every file in this directory once test-helper fan-in is considered. Wrapper-indirection
    // (a helper module that itself imports typescript) stays covered only by
    // oxlint-plugin/typescript-program-construction.cjs's FACTORIES call-level check on the
    // wrapper's own call site, not by this coarser dependency-graph backstop.
    //
    // 'typescript' resolves through an npm alias (package.json: "typescript":
    // "npm:@typescript/typescript6@..."), so the resolved realpath never
    // contains a literal "typescript" package directory; it lands in the
    // pnpm store under the aliased target name. The third alternative covers
    // pnpm's un-aliased realpath shape (`.pnpm/typescript@<version>/node_modules/
    // typescript`), which is what this package would resolve to if the alias in
    // package.json were ever removed -- without it, only the symlink-shaped first
    // alternative and the currently-aliased second alternative match, and neither
    // matches that un-aliased pnpm-store realpath, so the rule would silently stop
    // firing the moment the alias disappeared.
    path: '^node_modules/(?:typescript|\\.pnpm/@typescript\\+typescript6@[^/]+/node_modules/@typescript/typescript6|\\.pnpm/typescript@[^/]+/node_modules/typescript)(?:/|$)',
  },
}

module.exports = { noApiFixturesTypescriptReachability }
