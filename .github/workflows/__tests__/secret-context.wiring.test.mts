import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')
const packageJson = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
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

function pathFilterSection(workflow: string, filterName: string): string {
  const start = workflow.indexOf(`\n${filterName}:\n`)
  expect(start).toBeGreaterThanOrEqual(0)

  const rest = workflow.slice(start + 1)
  const next = rest.search(/\n[a-z][a-z0-9-]*:\n/)
  return next === -1 ? rest : rest.slice(0, next)
}

describe('secret-backed workflow context gates (wiring and routing)', () => {
  it('keeps workflow tests wired into the tooling test job', () => {
    const pathFilters = read('.github/ci-path-filters.yml')
    const toolingWorkflow = read('.github/workflows/tests-tooling.yml')

    expect(pathFilters).toContain("- '.github/workflows/**/*.test.mts'")
    expect(toolingWorkflow).toContain(
      'node ci/tooling-test-runner.mts --workflow-projects --bail=3 "${FILES[@]}"',
    )
    expect(toolingWorkflow).toContain(
      "VITEST_COVERAGE_ENABLED: ${{ inputs.publish_coverage && 'true' || 'false' }}",
    )
    expect(packageJson.scripts['test:tooling']).toBe('node ci/tooling-test-runner.mts')
    expect(vitestConfig).toContain("name: 'github-actions'")
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
    expect(workflow).toContain('[ "$HEAD_REPO" = "$BASE_REPO" ]')
  })

  it('skips orchestrated secret-backed jobs on untrusted bot or fork PRs', () => {
    const workflow = read('.github/workflows/ci.yml')
    const guardedJobs = ['build-backend', 'build-web', 'test-playwright-credentialed']

    for (const job of guardedJobs) {
      expect(jobSection(workflow, job)).toContain(
        "needs.detect-changes.outputs.trusted-secret-context == 'true'",
      )
    }
    expect(
      workflow.match(
        /trusted_secret_context: \$\{\{ needs\.detect-changes\.outputs\.trusted-secret-context == 'true' \}\}/g,
      ),
    ).toHaveLength(4)
  })

  it('documents every Vitest project exactly once in VITEST.md', () => {
    const mappingTable = read('.github/workflows/VITEST.md').split(
      '\nCurrent conventions for future credentialed suites:',
    )[0]
    const projectNames = Array.from(
      new Set(Array.from(vitestConfig.matchAll(/name: '([^']+)'/g), match => match[1])),
    )
    const documentedProjects = Array.from(
      mappingTable.matchAll(/\| `([^`]+)`\s+\| `[^`]+\.yml`/g),
      match => match[1],
    )

    expect(documentedProjects.toSorted()).toEqual(projectNames.toSorted())
  })
})
