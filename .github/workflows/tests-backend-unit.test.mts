import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
const workflow = readFileSync('.github/workflows/tests-backend-unit.yml', 'utf8')
const stepsWorkflow = load(workflow) as {
  jobs?: Record<
    string,
    {
      steps?: Array<{ env?: Record<string, string>; name?: string; run?: string }>
    }
  >
}
const runBackendTestsScript = stepsWorkflow.jobs?.['backend-tests']?.steps?.find(
  step => step.name === 'Run backend tests',
)?.run
const vitestConfig = [
  'vitest.config.mts',
  'test-helpers/vitest-config/backend-core-projects.mts',
  'test-helpers/vitest-config/backend-data-projects.mts',
  'test-helpers/vitest-config/environment.mts',
]
  .map(path => readFileSync(path, 'utf8'))
  .join('\n')
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>
}
const vitestProjectGroupRunner = readFileSync('ci/run-vitest-project-group.mts', 'utf8')
function jobSection(jobName: string): string {
  const start = workflow.indexOf(`\n  ${jobName}:`)
  expect(start).toBeGreaterThanOrEqual(0)
  const rest = workflow.slice(start + 1)
  const next = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/)
  return next === -1 ? rest : rest.slice(0, next)
}
describe('backend uncredentialed Docker test workflow', () => {
  it('leaves Docker-free static checks to the backend module workflow', () => {
    const backendJob = jobSection('backend-tests')
    expect(workflow).toContain('name: Backend Uncredentialed Docker Tests')
    expect(backendJob).not.toContain('Check backend dependencies')
    expect(backendJob).not.toContain('Typecheck backend and email templates')
  })
  it('prepares a demand-neutral configurable backend test shard matrix on ubuntu-latest', () => {
    const prep = jobSection('prep')
    expect(prep).toContain('runs-on: ubuntu-latest')
    expect(prep).toContain('uses: ./.github/actions/make-shard-matrix')
    expect(prep).toContain('node ci/vitest/shard-total.mts test-backend-unit')
    expect(prep).toContain(
      'FILES_PER_SHARD_OVERRIDE: ${{ vars.TEST_BACKEND_UNIT_FILES_PER_SHARD }}',
    )
    expect(prep).toContain('total: ${{ steps.shard-total.outputs.shard-total }}')
    expect(prep).toContain('shard-matrix: ${{ steps.shards.outputs.matrix }}')
    expect(prep).toContain('shard-total: ${{ steps.shards.outputs.total }}')
    expect(workflow).not.toContain('max-parallel')
  })

  it('keeps OpenAI integration tests out of the normal backend project', () => {
    expect(vitestConfig).toContain("name: 'backend-openai'")
    expect(vitestConfig).toContain("include: ['backend/**/*.openai*.test.mts']")
    expect(vitestConfig).toContain("'**/*.openai*.test.mts'")
    expect(vitestConfig).not.toContain("include: ['backend/**/*.openai.test.mts']")
    expect(packageJson.scripts['test:backend:core']).not.toContain('backend-openai')
    expect(packageJson.scripts['test:backend:openai']).toBe(
      'node ci/run-vitest-project-group.mts backend-openai',
    )
    expect(packageJson.scripts['test:backend:core']).not.toContain('backend-bedrock')
    expect(packageJson.scripts['test:backend:bedrock']).toBe(
      'node ci/run-vitest-project-group.mts backend-bedrock',
    )
    expect(packageJson.scripts['test:backend']).toContain('run-vitest-project-group.mts backend')
    expect(vitestProjectGroupRunner).toContain("'backend-openai'")
    expect(vitestProjectGroupRunner).toContain("'backend-bedrock'")
    expect(packageJson.scripts['test:backend']).not.toContain('pnpm run')
    expect(packageJson.scripts.test).toContain('pnpm run test:backend')
  })

  it('combines service-backed backend Vitest projects in one sharded command', () => {
    const backendCommand =
      'pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend/analytics-integration --project backend-data-stores --project backend-mocks --project backend-real-glide-mq --shard ${{ matrix.shard }}/${{ needs.prep.outputs.shard-total }}'
    expect(workflow).toContain(backendCommand)
    expect(workflow).toContain(
      "VITEST_COVERAGE_ENABLED: ${{ inputs.publish_coverage && 'true' || 'false' }}",
    )
    expect(workflow).not.toContain('--coverage')
    expect(vitestConfig).not.toContain("name: 'backend-seed-csvs'")
    expect(vitestConfig).toContain("name: 'backend-real-glide-mq'")
    expect(vitestConfig).not.toContain('sequence: { groupOrder')
    expect(vitestConfig).not.toContain('fileParallelism: false')
    expect(vitestConfig).toContain("name: 'backend-activitypub-capacity'")
    expect(workflow).not.toContain('--project backend-aws --shard')
    expect(workflow).not.toContain('--project backend-openai --shard')
    expect(workflow).not.toContain('--project backend-bedrock --shard')
    expect(workflow).not.toContain('--project backend-no-data-mocks')
    expect(workflow).not.toContain('--project backend-modules')
    expect(workflow).not.toContain('analytics-data-store-test-report.junit.xml')
    expect(workflow).not.toContain('analytics-service-test-report.junit.xml')
    expect(workflow).not.toContain('analytics-db-service-test-report.junit.xml')
  })

  it('stamps backend coverage with the prepared shard total', () => {
    const stamp = stepsWorkflow.jobs?.['backend-tests']?.steps?.find(
      step => step.name === 'Stamp backend-shard-${{ matrix.shard }} coverage provenance',
    )
    expect(stamp?.env).toMatchObject({
      CI_SHARD: '${{ matrix.shard }}/${{ needs.prep.outputs.shard-total }}',
      PR_BASE_SHA: '${{ github.event.pull_request.base.sha }}',
      PR_HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
    })
  })

  it('builds email templates and migrates each shard without owning backend smoke', () => {
    // Email-templates build is folded into .github/actions/setup-backend. Each
    // shard still owns that setup and migration; the standalone smoke workflow
    // owns allocated-port API/worker smoke instead.
    const setupBackend = workflow.indexOf('actions/setup-backend')
    const migration = workflow.indexOf('node data-stores/psql/migrate.mts')

    expect(setupBackend).toBeGreaterThanOrEqual(0)
    expect(migration).toBeGreaterThan(setupBackend)
    expect(workflow).not.toContain('Allocate backend port')
    expect(workflow).not.toContain('./scripts/tests/smoke-test-server.sh')
    expect(workflow).not.toContain('./scripts/tests/smoke-test-worker.sh')
  })

  it('uses threads by default but keeps backend projects on forks', () => {
    expect(vitestConfig).toContain("pool: 'threads'")
    expect(vitestConfig).toContain("pool: 'forks'")
    expect(vitestConfig).toContain('--disable-warning=DEP0205')
    expect(workflow).not.toContain('VITEST_POOL=forks')
  })

  it('keeps default backend shards free of external credentials', () => {
    const backendJob = jobSection('backend-tests')
    const deletedTestsRoleVariable = ['AWS', 'TESTS', 'ROLE', 'ARN'].join('_')

    expect(workflow).not.toContain('id-token: write')
    expect(backendJob).not.toContain('AWS_REGION: us-west-2')
    expect(backendJob).not.toContain(deletedTestsRoleVariable)
    expect(backendJob).not.toContain('Configure AWS credentials')
    expect(backendJob).not.toContain('OPENAI_API_KEY')
  })

  it('keeps consumed LCOV fallback uploads best-effort but not under a 1-minute cap', () => {
    const backendJob = jobSection('backend-tests')
    const fallbackStepIndex = backendJob.indexOf(
      'name: Upload backend-shard-${{ matrix.shard }} coverage pair to GitHub (fallback attempt 1)',
    )
    const fallbackStep = backendJob.slice(
      fallbackStepIndex,
      backendJob.indexOf('\n      - ', fallbackStepIndex + 1),
    )

    expect(fallbackStepIndex).toBeGreaterThanOrEqual(0)
    expect(fallbackStep).toContain('continue-on-error: true')
    expect(fallbackStep).toContain('uses: ./.github/actions/upload-coverage-pair')
    expect(fallbackStep).toContain('suite: backend-shard-${{ matrix.shard }}')
  })

  it('provides a pure image origin to backend serialization tests', () => {
    expect(jobSection('backend-tests')).toContain('IMAGE_ORIGIN: http://127.0.0.1:3100')
  })

  it('runs fork-crash diagnostics only on failure, without changing the test command (#8940)', () => {
    const backendJob = jobSection('backend-tests')
    const testStepIndex = backendJob.indexOf('name: Run backend tests')
    const reportSummaryIndex = backendJob.indexOf('name: Vitest fork diagnostic report summary')
    const uploadIndex = backendJob.indexOf(
      'name: vitest-fork-diagnostics-backend-shard-${{ matrix.shard }}',
    )

    // Ordering: diagnostics run after the test step and before the pre-existing blob upload.
    expect(testStepIndex).toBeGreaterThanOrEqual(0)
    expect(reportSummaryIndex).toBeGreaterThan(testStepIndex)
    expect(uploadIndex).toBeGreaterThan(reportSummaryIndex)
    expect(
      backendJob.indexOf(
        'name: Upload backend-shard-${{ matrix.shard }} vitest blob to GitHub (fallback)',
      ),
    ).toBeGreaterThan(uploadIndex)

    // The test step's run command is unchanged by this env-var-only addition.
    expect(runBackendTestsScript).toContain(
      'pnpm exec ./ci/with-node-test-options vitest run --bail=3',
    )
    expect(jobSection('backend-tests')).toContain(
      'VITEST_FORK_DIAGNOSTIC_DIR: .vitest-reports/fork-diagnostics-${{ matrix.shard }}',
    )

    const steps = stepsWorkflow.jobs?.['backend-tests']?.steps ?? []
    const reportSummaryStep = steps.find(
      step => step.name === 'Vitest fork diagnostic report summary',
    ) as { env?: Record<string, string>; if?: string; ['continue-on-error']?: boolean } | undefined

    expect(steps.some(step => step.name === 'Host pressure diagnostics')).toBe(false)
    expect(backendJob).not.toContain('host-pressure-diagnostics.sh')
    expect(reportSummaryStep?.if).toBe('failure()')
    expect(reportSummaryStep?.['continue-on-error']).toBe(true)
    expect(reportSummaryStep?.env?.VITEST_FORK_DIAGNOSTIC_DIR).toBe(
      '.vitest-reports/fork-diagnostics-${{ matrix.shard }}',
    )

    expect(backendJob).not.toContain('with-heavy-slot.sh')
  })

  it('does not restore or save a remote Vite transform cache', () => {
    // The repository cache policy permits only the pnpm store and Playwright browsers; a
    // remote Vite cache round-trip once consumed a job's entire timeout budget.
    expect(workflow).not.toMatch(/actions\/cache\/(?:restore|save)|\.cache\/vite\/vitest/u)
  })
})
