/**
 * dependency-cruiser configuration for backend/
 *
 * Backend source must stay acyclic so entrypoints remain easy to reason about.
 * Entrypoint npm-module restrictions live in .no-mistakes.yml
 * (forbidden-dependencies / forbidden-workspace-closure) because pnpm store
 * realpaths defeat node_modules-path regexes here.
 *
 * The same realpath issue rules out a dependency-cruiser `dependencyTypes:
 * ['npm-dev']` rule for catching production imports of workspace
 * devDependencies (#8871): dependency-cruiser only classifies a dependency as
 * `npm-dev` when its *resolved* path contains `node_modules`, but pnpm
 * symlinks resolve to in-repo realpaths, so classification falls through to
 * `undetermined` for every workspace import here. The only fix,
 * `preserveSymlinks: true`, would rewrite every resolved path to
 * `<pkg>/node_modules/...`, breaking the `^backend/...` path regexes in
 * package-boundaries.cjs and data-stores-*.cjs and fragmenting the
 * `no-circular` graph. That invariant is instead enforced by the
 * `production-dependency-declarations` rule in .no-mistakes.yml, which
 * resolves declarations directly against each package's package.json.
 *
 * `no-circular`, `not-to-unresolvable`, and `no-non-package-json` are copied
 * into `forbidden`. dependency-cruiser merges `extends` by reading `.forbidden`
 * only, and those presets export a bare rule, so extending them adds nothing.
 */

const path = require('node:path')
const dataStorePrimaryRules = require('./dependency-cruiser-rules/data-stores-primary.cjs')
const dataStoreSecondaryRules = require('./dependency-cruiser-rules/data-stores-secondary.cjs')
const packageBoundaryRules = require('./dependency-cruiser-rules/package-boundaries.cjs')
const workspacePackageRelativeImportBoundaryRules = require('./dependency-cruiser-rules/workspace-package-relative-import-boundaries.cjs')
const {
  noBuildInsertQueryOutsideEntityRelations,
} = require('./dependency-cruiser-rules/entity-relations-build-insert-query.cjs')
const {
  noApiFixturesTypescriptReachability,
} = require('./dependency-cruiser-rules/api-fixtures-typescript-reachability.cjs')

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'not-to-unresolvable',
      comment: 'backend imports must resolve to source files or installed packages.',
      severity: 'error',
      from: {},
      to: {
        couldNotResolve: true,
      },
    },
    {
      name: 'no-circular',
      comment: 'backend source should stay acyclic so entrypoints remain easy to reason about.',
      severity: 'error',
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: 'no-non-package-json',
      comment:
        "This module depends on an npm package that isn't in the 'dependencies' section " +
        "of your package.json. That's problematic as the package either (1) won't be " +
        'available on live (2 - worse) will be available on live with an non-guaranteed ' +
        'version. Fix it by adding the package to the dependencies in your package.json.',
      severity: 'error',
      from: {},
      to: {
        dependencyTypes: ['npm-no-pkg', 'npm-unknown'],
      },
    },
    ...dataStorePrimaryRules,
    ...dataStoreSecondaryRules,
    ...packageBoundaryRules,
    ...workspacePackageRelativeImportBoundaryRules,
    noBuildInsertQueryOutsideEntityRelations,
    noApiFixturesTypescriptReachability,
  ],

  options: {
    tsConfig: {
      fileName: path.join(__dirname, 'tsconfig.json'),
    },
    tsPreCompilationDeps: true,
    doNotFollow: {
      // The bare `fixtures` alternative is unanchored and would otherwise also match
      // `backend/test-helpers/api-fixtures/**` as a substring, silently stopping
      // dependency-cruiser from ever resolving that directory's own imports (so no
      // `to`-based forbidden rule scoped to api-fixtures could ever fire). It uses the
      // same `^(?!.*api-fixtures/).*` whole-path guard as every other alternative below,
      // which keeps every other intended match (a `fixtures/` path segment, or a
      // `*-fixtures.mts` file/module name) while excluding `api-fixtures`, which
      // dependency-cruiser rules must be able to follow.
      //
      // A narrower negative-lookbehind guard (`(?<!api-)fixtures`, blocking only the
      // literal `fixtures` occurrence directly preceded by `api-`) was tried first and is
      // NOT sufficient: `backend/test-helpers/api-fixtures/__fixtures__/bar.mts` contains
      // `fixtures` twice -- once inside `api-fixtures` (blocked by the lookbehind) and
      // once inside `__fixtures__` (not preceded by `api-`, so the lookbehind lets it
      // through) -- so the bare alternative still matched and re-excluded the path even
      // with the dedicated `__fixtures__` alternative below correctly anchored
      // (empirically confirmed with a fixture test, #9317 round-2 review). The whole-path
      // guard checks the entire string for an `api-fixtures/` segment instead of one fixed
      // position, so it has no such blind spot.
      //
      // The `.test.mts`/`.spec.mts` alternative has the same problem: api-fixtures/
      // contains dozens of *.test.mts contract tests (e.g. backend-program.probes.test.mts),
      // and doNotFollow stops dependency-cruiser from resolving a matched module's own
      // imports at all -- so a test file directly importing `typescript` would be
      // invisible to no-api-fixtures-typescript-reachability.cjs (empirically confirmed:
      // injecting `import ts from 'typescript'` into an api-fixtures *.test.mts file
      // produced zero violations before this fix). The `^(?!.*api-fixtures/)` guard
      // must anchor at the start of the whole alternative -- an unanchored negative
      // lookahead lets the regex engine retry matching from a later position (e.g.
      // right after `api-fixtures/`), silently defeating the exclusion the same way the
      // bare `fixtures` alternative did above.
      //
      // The `\.mock\.mts$`, `__tests__`, `__fixtures__`, and `build` alternatives had the
      // same problem and are anchored here too (#9317, the round-5 review follow-up to #9307),
      // using the identical `^(?!.*api-fixtures/).*` guard as the `*.test.mts`/`*.spec.mts`
      // alternative above, for the same reason: an unanchored negative lookahead would let the
      // regex engine retry from a later position and silently defeat the exclusion.
      //
      // `__fixtures__`, `fixtures`, and `build` match directory segments only (`/__fixtures__/`,
      // `/fixtures/`, `/build/`). A substring match would also drop `xml-builder.mts`,
      // `query-builder.mts`, `feed-query-builders/`, and `*-fixtures.mts`, which must stay in
      // the graph. The walker tests directory paths with no trailing slash, so the fixtures
      // alternative must not match the directory `backend/test-helpers/api-fixtures` itself or
      // that whole tree is skipped. The api-fixtures guard still lets `api-fixtures/**/build/`
      // and `api-fixtures/**/fixtures/` be followed.
      //
      // `node_modules` and `.next` are intentionally global excludes (node_modules must stay
      // excluded even under api-fixtures/) and stay unanchored; do not add the
      // `^(?!.*api-fixtures/).*` guard to them.
      path: [
        'node_modules',
        String.raw`^(?!.*api-fixtures/).*(\.test|\.spec)\.mts$`,
        String.raw`^(?!.*api-fixtures/).*\.mock\.mts$`,
        String.raw`^(?!.*api-fixtures/).*__tests__`,
        String.raw`^(?!.*api-fixtures/).*(?:^|/)__fixtures__/`,
        String.raw`^(?!.*api-fixtures/).*(?:^|/)fixtures/`,
        String.raw`\.next`,
        String.raw`^(?!.*api-fixtures/).*(?:^|/)build/`,
      ].join('|'),
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['main', 'types', 'typings'],
    },
    moduleSystems: ['es6', 'cjs'],
  },
}
