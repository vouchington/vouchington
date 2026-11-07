const coverageGate = "VITEST_COVERAGE_ENABLED: ${{ inputs.publish_coverage && 'true' || 'false' }}"

const coverageWorkflowPaths = [
  'tests-backend-modules.yml',
  'tests-tooling.yml',
  'tests-ts-shared.yml',
  'tests-portability.yml',
  'tests-lambdas.yml',
  'tests-cloudflare-worker.yml',
  'tests-web.yml',
  'tests-web-api.yml',
  'tests-web-integration.yml',
]

/** Small source-only controls; all policy inputs are literal and independent of checker constants. */
export function createVitestProjectCommandFixture(): Record<string, string> {
  const workflows = Object.fromEntries(
    coverageWorkflowPaths.map(path => [
      `.github/workflows/${path}`,
      `jobs:\n  test:\n    steps:\n      - env:\n          ${coverageGate}\n        run: pnpm exec vitest run --project synthetic-suite\n`,
    ]),
  )
  return {
    ...workflows,
    '.github/ci-path-filters.yml': `web:\n  - 'test-helpers/vitest-config/web-projects.mts'\n`,
    '.github/workflows/AGENTS.md':
      'Follow ../../docs/checklists/github-actions.md#checklist for test validation.\n',
    '.github/workflows/main-web.yml': `paths:\n  - 'test-helpers/vitest-config/web-projects.mts'\n`,
    '.github/workflows/main-storybook.yml': `paths:\n  - 'test-helpers/vitest-config/web-projects.mts'\n`,
    '.github/workflows/storybook.yml': `jobs:\n  browser:\n    steps:\n      - env:\n          STORYBOOK_BROWSER_COVERAGE: \${{ inputs.publish_coverage && '1' || '0' }}\n`,
    '.github/workflows/tests-tooling.yml': `jobs:\n  tooling:\n    steps:\n      - env:\n          ${coverageGate}\n        run: node ci/tooling-test-runner.mts --workflow-projects --bail=3\n`,
    '.github/workflows/tests-portability.yml': `jobs:\n  portability:\n    steps:\n      - uses: vouchington/vouchington-tooling/.github/actions/setup-node-pnpm@${'a'.repeat(40)}\n      - env:\n          ${coverageGate}\n        run: pnpm run test:portability -- --bail=3\n`,
    'ci/run-vitest-project-group.mts': `export const groups = {\n  'lambdas': ['lambdas', 'lambdas-mocks', 'lambdas-portability'],\n  'cloudflare-worker': ['cloudflare-worker', 'cloudflare-worker-mocks', 'cloudflare-worker-portability'],\n  'portability': ['lambdas-portability', 'cloudflare-worker-portability'],\n}\n`,
    'docs/checklists/github-actions.md':
      'Run `pnpm exec vitest run --project github-actions` for workflow changes.\n',
  }
}
