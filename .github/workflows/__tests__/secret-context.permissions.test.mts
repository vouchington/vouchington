import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

const packageJson = JSON.parse(read('package.json')) as {
  scripts: Record<string, string>
}
const toolingTestRunner = read('ci/tooling-test-runner.mts')
const nodeTestOptions = read('ci/with-node-test-options')

const vitestConfig = [
  'vitest.config.mts',
  'test-helpers/vitest-config/backend-core-projects.mts',
  'test-helpers/vitest-config/backend-data-projects.mts',
  'test-helpers/vitest-config/environment.mts',
  'test-helpers/vitest-config/storybook-browser-project.mts',
  'test-helpers/vitest-config/tooling-projects.mts',
  'test-helpers/vitest-config/web-projects.mts',
]
  .map(read)
  .join('\n')

function jobSection(workflow: string, jobName: string): string {
  const start = workflow.indexOf(`\n  ${jobName}:`)
  expect(start).toBeGreaterThanOrEqual(0)

  const rest = workflow.slice(start + 1)
  const next = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/)
  return next === -1 ? rest : rest.slice(0, next)
}

function mappingSection(workflow: string, key: string): string {
  const start = workflow.indexOf(`\n  ${key}:`)
  expect(start).toBeGreaterThanOrEqual(0)

  const rest = workflow.slice(start + 1)
  const next = rest.search(/\n {2}[a-z_][a-z0-9_-]*:\n/)
  return next === -1 ? rest : rest.slice(0, next)
}

function pathFilterSection(workflow: string, filterName: string): string {
  const start = workflow.indexOf(`\n${filterName}:\n`)
  expect(start).toBeGreaterThanOrEqual(0)

  const rest = workflow.slice(start + 1)
  const next = rest.search(/\n[a-z][a-z0-9-]*:\n/)
  return next === -1 ? rest : rest.slice(0, next)
}

describe('secret-backed workflow context gates (permissions and security)', () => {
  it('keeps workflow tests wired into the tooling test job', () => {
    const filters = read('.github/ci-path-filters.yml')
    const toolingWorkflow = read('.github/workflows/tests-tooling.yml')

    expect(filters).toContain('tooling:')
    expect(filters).toContain("- '.github/workflows/**/*.test.mts'")
    expect(filters).not.toContain("- '.github/workflows/tests-backend-untrusted.yml'")
    expect(toolingWorkflow).toContain(
      'node ci/tooling-test-runner.mts --workflow-projects --bail=3 "${FILES[@]}"',
    )
    expect(toolingWorkflow).toContain(
      "VITEST_COVERAGE_ENABLED: ${{ inputs.publish_coverage && 'true' || 'false' }}",
    )
    expect(toolingWorkflow).toContain(
      "VITEST_SELECTED_FILES: ${{ !inputs.full_suite && inputs.selected_test_files || '' }}",
    )
    expect(packageJson.scripts.test).toContain('pnpm run test:tooling')
    expect(packageJson.scripts['test:tooling']).toBe('node ci/tooling-test-runner.mts')
    expect(toolingTestRunner).toContain('tooling-project-registry.mts')
    expect(vitestConfig).toContain("name: 'github-actions'")
    expect(vitestConfig).toContain("include: ['.github/{actions,workflows}/**/*.test.mts']")
  })

  it('runs backend image builds when runtime packaging helpers change', () => {
    const buildBackendFilter = pathFilterSection(
      read('.github/ci-path-filters.yml'),
      'build-backend',
    )

    expect(buildBackendFilter).toContain(
      "'static-code-analysis/docker-deploy/restore-deployed-workspace-packages.mts'",
    )
  })

  it('publishes separate trusted and dependency-bot test contexts', () => {
    const workflow = read('.github/workflows/ci-detect-changes.yml')

    expect(workflow).toContain(
      'trusted-secret-context: ${{ steps.trusted-context.outputs.trusted }}',
    )
    expect(workflow).toContain(
      'dependency-bot-test-context: ${{ steps.trusted-context.outputs.dependency-bot-test }}',
    )
    expect(workflow).toContain('id: trusted-context')
    expect(workflow).toContain('"dependabot[bot]"|"renovate[bot]")')
    expect(workflow).toContain('[ "$HEAD_REPO" = "$BASE_REPO" ]')
    expect(workflow).not.toContain('HEAD_REF')
    expect(workflow).not.toContain('dependabot/*')
    expect(workflow).not.toContain('renovate/*')
  })

  it('isolates Codecov OIDC from PR-controlled coverage code', () => {
    const workflow = read('.github/workflows/ci.yml')
    const coverageWorkflow = read('.github/workflows/ci-test-coverage.yml')
    const codecovWorkflow = read('.github/workflows/ci-upload-codecov.yml')
    const coverageJob = jobSection(coverageWorkflow, 'test-coverage')
    const codecovJob = jobSection(codecovWorkflow, 'upload-codecov')
    const codecovCaller = jobSection(workflow, 'upload-codecov')

    expect(coverageJob).toContain('name: Patch Coverage')
    expect(coverageJob).not.toContain('id-token: write')
    expect(coverageJob).not.toContain('AWS_TEST_ROLE_ARN')
    expect(codecovJob).toContain('id-token: write')
    expect(codecovCaller).toContain('id-token: write')
    expect(codecovJob).not.toContain('run:')
    expect(codecovWorkflow).not.toContain('./.github/actions/')
    expect(coverageWorkflow).not.toContain('CODECOV_TOKEN')
    expect(codecovWorkflow).not.toContain('CODECOV_TOKEN')
    expect(workflow).not.toContain(`${['coverage', 'store'].join('-')}:`)
    expect(workflow).not.toContain(`${['store', 'coverage'].join('-')}:`)

    for (const path of ['.github/workflows/main-web.yml', '.github/workflows/main-backend.yml']) {
      expect(read(path)).not.toContain(`${['store', 'coverage'].join('-')}:`)
    }
  })

  it('passes trusted_secret_context to main backend credentialed tests', () => {
    const workflow = read('.github/workflows/main-backend.yml')
    const credentialedJob = jobSection(workflow, 'test-backend-credentialed')

    expect(credentialedJob).toContain('uses: ./.github/workflows/tests-backend-credentialed.yml')
    expect(credentialedJob).toContain('trusted_secret_context: true')
  })

  it('runs Storybook tests through the CI orchestrator after static analysis', () => {
    const workflow = read('.github/workflows/ci.yml')
    const detectChanges = read('.github/workflows/ci-detect-changes.yml')
    const runtimeFilters = read('.github/ci-runtime-path-filters.yml')
    const storybookJob = jobSection(workflow, 'storybook')
    const coverageJob = jobSection(workflow, 'test-coverage')
    const testsJob = jobSection(read('.github/workflows/ci.yml'), 'tests-processing')
    const storybookWorkflow = read('.github/workflows/storybook.yml')

    expect(detectChanges).toContain('storybook: ${{ steps.refine-runtime-web.outputs.storybook }}')
    expect(runtimeFilters).toContain('storybook:')
    const storybookRuntimeFilter = pathFilterSection(runtimeFilters, 'storybook')
    expect(storybookRuntimeFilter).not.toContain('.github/workflows/')
    expect(storybookRuntimeFilter).not.toContain('.github/actions/**')
    expect(runtimeFilters).toContain('web/**')
    expect(runtimeFilters).toContain('vitest.config.mts')
    expect(runtimeFilters).toContain('package.json')
    expect(runtimeFilters).toContain('pnpm-lock.yaml')
    expect(storybookJob).toContain('needs: [detect-changes, static-code-analysis, select-ci]')
    expect(storybookJob).toContain("needs.detect-changes.outputs.storybook == 'true'")
    expect(storybookJob).toContain(
      "needs.detect-changes.outputs.trusted-secret-context == 'true' || needs.detect-changes.outputs.dependency-bot-test-context == 'true'",
    )
    expect(storybookJob).toContain("needs.static-code-analysis.result == 'success'")
    expect(storybookJob).toContain('uses: ./.github/workflows/storybook.yml')
    expect(storybookJob).toContain('contents: read')
    expect(storybookJob).not.toContain('id-token: write')
    expect(storybookJob).not.toContain('deployments: write')
    expect(storybookJob).not.toContain('publish_static_artifact')
    expect(storybookJob).not.toContain('presign_manifest:')
    expect(storybookJob).toContain("publish_coverage: ${{ github.event_name == 'pull_request' }}")
    expect(storybookJob).toContain("cancel_in_progress: ${{ github.event_name == 'pull_request' }}")
    expect(storybookJob).not.toContain('publish_prefix:')
    expect(storybookJob).toContain('checkout_ref: ${{ github.sha }}')
    expect(storybookJob).not.toContain('github.event.pull_request.head.sha')
    // PR Storybook remains read-only and concurrency_key still cancels stale runs.
    expect(storybookJob).toContain(
      "concurrency_key: ${{ github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number) || '' }}",
    )
    expect(storybookJob).not.toContain('secrets: inherit')
    expect(coverageJob).toContain('storybook-result: ${{ needs.storybook.result }}')
    expect(testsJob).toContain('test-coverage')
    expect(storybookWorkflow).toContain('workflow_call:')
    expect(storybookWorkflow).toContain('runs-on: ubuntu-latest')
    expect(storybookWorkflow).toContain(
      'VITEST_COVERAGE_SCOPE=web-storybook pnpm exec ./ci/with-node-test-options vitest run --bail=3',
    )
    expect(storybookWorkflow).toContain("VITEST_STORYBOOK_BROWSER_MAX_WORKERS: '1'")
    expect(vitestConfig).toContain('VITEST_STORYBOOK_BROWSER_MAX_WORKERS')
    expect(vitestConfig).toContain('maxWorkers: parseStorybookBrowserMaxWorkers()')
    expect(mappingSection(storybookWorkflow, 'workflow_call')).toContain('default: false')
    expect(mappingSection(storybookWorkflow, 'workflow_call')).toContain('default: main')
    expect(mappingSection(storybookWorkflow, 'workflow_call')).toContain("default: ''")
    expect(mappingSection(storybookWorkflow, 'workflow_dispatch')).toContain('default: false')
    expect(mappingSection(storybookWorkflow, 'workflow_dispatch')).toContain('default: main')
    expect(mappingSection(storybookWorkflow, 'workflow_dispatch')).toContain('cancel_in_progress:')
    expect(mappingSection(storybookWorkflow, 'workflow_dispatch')).not.toContain(
      'manual PR preview publishing',
    )
    expect(storybookWorkflow).toContain(
      "group: ${{ github.workflow }}-${{ inputs.cancel_in_progress && (inputs.concurrency_key || inputs.publish_prefix) || inputs.checkout_ref || github.sha }}-${{ inputs.cancel_in_progress && 'cancel' || 'queue' }}",
    )
    expect(storybookWorkflow).toContain('ref: ${{ inputs.checkout_ref || github.sha }}')
    expect(storybookWorkflow).toContain('cancel-in-progress: ${{ inputs.cancel_in_progress }}')
    expect(storybookWorkflow).not.toContain('inputs.trusted_secret_context')
    // PR-controlled Storybook code cannot publish or request a Pages artifact.
    // dispatch-completed-deploy.yml alone sends successful main-storybook source metadata.
    expect(storybookWorkflow).not.toContain('storybook-publish:')
    expect(storybookWorkflow).not.toContain('publish_static_artifact')
    expect(storybookWorkflow).not.toContain('CLOUDFLARE_PAGES_API_TOKEN')
    expect(storybookWorkflow).not.toContain('storybook-static')
    expect(storybookWorkflow).not.toContain('deployments: write')
    expect(storybookWorkflow).not.toContain('id-token: write')
    expect(storybookWorkflow).not.toMatch(/uses: actions\/github-script@/)
    expect(storybookWorkflow).not.toContain('\n  pull_request:')
    expect(storybookWorkflow).not.toContain('branches:\n      - main')
  })

  it('keeps CI Node warning suppression out of workflow startup hooks', () => {
    for (const workflowPath of readdirSync('.github/workflows').filter(path =>
      path.endsWith('.yml'),
    )) {
      const workflow = read(`.github/workflows/${workflowPath}`)
      expect(workflow).not.toMatch(
        /^\s+BASH_ENV:(?!(?:\s*(?:\/dev\/null|["']\/dev\/null["'])\s*(?:#.*)?$))/m,
      )
      expect(workflow).not.toContain('NODE_OPTIONS: --disable-warning=DEP0205')
    }
    expect(nodeTestOptions).toContain('${NODE_OPTIONS:+$NODE_OPTIONS }--disable-warning=DEP0205')
    expect(nodeTestOptions).toContain('*" --disable-warning=DEP0205 "*)')
  })

  it('keeps worker policy repository-owned and specific to each test surface', () => {
    expect(read('.github/workflows/tests-backend-modules.yml')).toContain("VITEST_MAX_WORKERS: '3'")
    expect(read('.github/workflows/tests-backend-unit.yml')).toContain("VITEST_MAX_WORKERS: '3'")
    expect(read('.github/workflows/tests-backend-credentialed.yml')).toContain(
      "VITEST_MAX_WORKERS: '3'",
    )
    expect(read('.github/workflows/tests-web.yml')).toContain("VITEST_MAX_WORKERS: '4'")
    // These workflows inherit the two-worker CI fallback pending candidate-run evidence.
    for (const path of [
      '.github/workflows/tests-cloudflare-worker.yml',
      '.github/workflows/tests-lambdas.yml',
      '.github/workflows/tests-portability.yml',
      '.github/workflows/tests-tooling.yml',
      '.github/workflows/tests-ts-shared.yml',
      '.github/workflows/tests-web-api.yml',
      '.github/workflows/tests-web-integration.yml',
    ]) {
      expect(read(path)).not.toContain('VITEST_MAX_WORKERS')
    }
    for (const path of [
      '.github/workflows/tests-playwright.yml',
      '.github/workflows/tests-playwright-credentialed.yml',
    ]) {
      expect(read(path)).toContain("PLAYWRIGHT_MAX_WORKERS: '3'")
    }
    for (const path of readdirSync('.github/workflows').filter(path => path.endsWith('.yml'))) {
      const workflow = read(`.github/workflows/${path}`)
      expect(workflow).not.toContain('load-runner-env')
      expect(workflow).not.toContain('vars.VITEST_MAX_WORKERS')
      expect(workflow).not.toContain('vars.PLAYWRIGHT_MAX_WORKERS')
    }
  })

  it('keeps Storybook changes in their own path filter', () => {
    const runtimeFilters = read('.github/ci-runtime-path-filters.yml')
    const storybookFilter = pathFilterSection(runtimeFilters, 'storybook')
    const playwrightFilter = pathFilterSection(runtimeFilters, 'playwright')

    expect(storybookFilter).not.toContain('.github/workflows/')
    expect(storybookFilter).toContain('web/**')
    expect(playwrightFilter).toContain('playwright.config.mts')
    expect(playwrightFilter).toContain('playwright/config/**')
    expect(playwrightFilter).toContain('playwright/tests/**')
    expect(playwrightFilter).toContain('playwright/helpers/**')
    expect(playwrightFilter).toContain('playwright/global-setup.mts')
    expect(playwrightFilter).toContain('backend/scripts/seeds/playwright-seed-assertions.mts')
    expect(playwrightFilter).not.toContain(',playwright/**,')
  })
})
