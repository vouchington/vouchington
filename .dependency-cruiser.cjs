/**
 * dependency-cruiser configuration for repo-level tooling.
 *
 * Enforces the tooling-vitest-imports guardrail:
 * Runtime tooling source files must not import from vitest. Tests can.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'not-to-unresolvable',
      comment: 'imports must resolve to source files or installed packages.',
      severity: 'error',
      from: { pathNot: '^(vitest\\.config|test-helpers/vitest-config/)' },
      to: {
        couldNotResolve: true,
        pathNot: '^(@typescript-eslint/parser|coverage-check)$',
      },
    },
    {
      name: 'no-circular',
      comment: 'repo tooling should stay acyclic so entrypoints remain easy to reason about.',
      severity: 'error',
      from: {
        path: '^(ci|dev/agent-issue-labels|dev/pr-description|playwright/tests|static-code-analysis)/',
      },
      to: {
        circular: true,
      },
    },
    {
      name: 'tooling-vitest-imports',
      comment: 'runtime tooling source files must not import vitest. Use plain Node.js instead.',
      severity: 'error',
      from: {
        path: '^(ci|dev/agent-issue-labels|static-code-analysis)/(?!.*\\.test\\.mts$)|^dev/pr-description(\\.mts$|/(?!.*\\.test\\.mts$))',
      },
      to: {
        path: '^vitest($|/)',
      },
    },
    {
      name: 'tooling-dependencies-must-be-declared-locally',
      comment:
        'CI and static-analysis workspaces must declare every imported package locally so filtered installs remain complete.',
      severity: 'error',
      from: {
        path: '^(ci|static-code-analysis)/',
      },
      to: {
        dependencyTypes: ['npm-no-pkg'],
      },
    },
    {
      name: 'playwright-specs-use-shared-test-helper',
      comment:
        'Playwright specs must import the shared helper instead of importing @playwright/test directly.',
      severity: 'error',
      from: {
        path: '^playwright/tests/.*\\.spec\\.mts$',
      },
      to: {
        path: '^node_modules/(?:@playwright/test|\\.pnpm/@playwright\\+test@[^/]+/node_modules/@playwright/test)(?:/|$)',
      },
    },
  ],

  options: {
    tsPreCompilationDeps: true,
    doNotFollow: {
      path: 'node_modules',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['module', 'main'],
    },
    moduleSystems: ['es6', 'cjs'],
  },
}
