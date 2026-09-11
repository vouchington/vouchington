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
  extends: [
    'dependency-cruiser/configs/rules/no-non-package-json',
    'dependency-cruiser/configs/rules/not-to-unresolvable',
    'dependency-cruiser/configs/rules/no-circular',
  ],
  forbidden: [
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
      // contains dozens of *.test.mts contract tests (e.g. backend-program-freshness.test.mts),
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
      // The `\.mock\.mts$`, `__tests__`, `__fixtures__`, and bare `build` alternatives had the
      // same problem and are anchored here too (#9317, the round-5 review follow-up to #9307),
      // using the identical `^(?!.*api-fixtures/).*` guard as the `*.test.mts`/`*.spec.mts`
      // alternative above, for the same reason: an unanchored negative lookahead would let the
      // regex engine retry from a later position and silently defeat the exclusion.
      //
      // The bare `build` alternative has an effect on api-fixtures/ today:
      // `backend/test-helpers/api-fixtures/cold-build-budget.mts`, the
      // `openapi/build-openapi-*.mts` files, and `openapi/schema-node-builders.mts` matched it
      // (and are now followed). `__tests__` and `.mock.mts` currently match no file under
      // api-fixtures/, so those two guards are inert today and only close the blind spot for
      // future files. `__fixtures__` matches no file under api-fixtures/ today either, but its
      // anchoring is load-bearing regardless: without the bare `fixtures` alternative also being
      // anchored (above), any future `__fixtures__` path under api-fixtures/ would stay excluded
      // via that sibling alternative no matter how the `__fixtures__` alternative itself were
      // written. `pnpm run dep-cruise:backend` was run before and after this change to confirm no
      // new violations were introduced by following the newly-reachable api-fixtures/ files (the
      // general `build` substring match still excludes every other `build`-named path repo-wide
      // -- e.g. query-builder.mts, xml-builder.mts, build-system-prompt.mts -- since the guard
      // only carves out api-fixtures/, it does not anchor `build` at path-start).
      //
      // `node_modules` and `.next` are intentionally global excludes (node_modules must stay
      // excluded even under api-fixtures/) and stay unanchored; do not add the
      // `^(?!.*api-fixtures/).*` guard to them.
      path: 'node_modules|^(?!.*api-fixtures/).*(\\.test|\\.spec)\\.mts$|^(?!.*api-fixtures/).*\\.mock\\.mts$|^(?!.*api-fixtures/).*__tests__|^(?!.*api-fixtures/).*__fixtures__|^(?!.*api-fixtures/).*fixtures|\\.next|^(?!.*api-fixtures/).*build',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['main', 'types', 'typings'],
    },
    moduleSystems: ['es6', 'cjs'],
  },
}
