import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/tests-backend-unit.yml', 'utf8')
const stepsWorkflow = load(workflow) as {
  on?: {
    workflow_call?: { inputs?: Record<string, { default?: boolean | string; type?: string }> }
    workflow_dispatch?: { inputs?: Record<string, { default?: boolean | string; type?: string }> }
  }
  jobs?: Record<
    string,
    { steps?: Array<{ env?: Record<string, string>; name?: string; run?: string }> }
  >
}
const runBackendTestsScript = stepsWorkflow.jobs?.['backend-tests']?.steps?.find(
  step => step.name === 'Run backend tests',
)?.run

// Isolates the FILES-array-computation prefix of the "Run backend tests" step
// (everything before the `pnpm exec ... vitest run` invocation) so it can be exercised
// directly, without actually running Vitest.
function filesArrayScript(): string {
  expect(runBackendTestsScript).toBeTypeOf('string')
  const script = runBackendTestsScript ?? ''
  const pnpmLineIndex = script.indexOf('pnpm exec ./ci/with-node-test-options vitest run')
  expect(pnpmLineIndex).toBeGreaterThan(0)
  return script.slice(0, pnpmLineIndex)
}

function runFilesArray(env: { FULL_SUITE: string; SELECTED_TEST_FILES: string }): string[] {
  const script = `${filesArrayScript()}printf '%s\\n' "\${FILES[@]}"`
  const result = spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  expect(result.status).toBe(0)
  return result.stdout.split('\n').filter(line => line.length > 0)
}
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
  it('runs tests by default for reusable and manual invocations', () => {
    expect(stepsWorkflow.on?.workflow_call?.inputs?.run_tests).toMatchObject({
      type: 'boolean',
      default: true,
    })
    expect(stepsWorkflow.on?.workflow_dispatch?.inputs?.run_tests).toMatchObject({
      type: 'boolean',
      default: true,
    })
    expect(stepsWorkflow.on?.workflow_dispatch?.inputs?.shard_total_override).toMatchObject({
      type: 'string',
      default: '',
    })
  })
  it('leaves Docker-free static checks to the backend module workflow', () => {
    const backendJob = jobSection('backend-tests')

    expect(workflow).toContain('name: Backend Uncredentialed Docker Tests')
    expect(backendJob).not.toContain('Check backend dependencies')
    expect(backendJob).not.toContain('Typecheck backend and email templates')
  })
  it('prepares a configurable backend test shard matrix on a self-hosted utility runner', () => {
    const prep = jobSection('prep')

    expect(prep).toContain('runs-on: [self-hosted]')
    expect(prep).toContain('uses: ./.github/actions/make-shard-matrix')
    expect(prep).toContain('total: ${{ inputs.shard_total_override || 5 }}')
    expect(prep).toContain('shard-matrix: ${{ steps.shards.outputs.matrix }}')
    expect(prep).toContain('shard-total: ${{ steps.shards.outputs.total }}')
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
      'pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend/analytics-integration --project backend-data-stores --project backend-mocks --project backend-real-glide-mq --shard ${{ matrix.shard }}/${{ needs.prep.outputs.shard-total }} --passWithNoTests "${FILES[@]}"'

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
    const hostPressureIndex = backendJob.indexOf('name: Host pressure diagnostics')
    const reportSummaryIndex = backendJob.indexOf('name: Vitest fork diagnostic report summary')
    const uploadIndex = backendJob.indexOf(
      'name: vitest-fork-diagnostics-backend-shard-${{ matrix.shard }}',
    )

    // Ordering: diagnostics run after the test step and before the pre-existing blob upload.
    expect(testStepIndex).toBeGreaterThanOrEqual(0)
    expect(hostPressureIndex).toBeGreaterThan(testStepIndex)
    expect(reportSummaryIndex).toBeGreaterThan(hostPressureIndex)
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
    const hostPressureStep = steps.find(step => step.name === 'Host pressure diagnostics') as
      | { if?: string; ['continue-on-error']?: boolean; run?: string }
      | undefined
    const reportSummaryStep = steps.find(
      step => step.name === 'Vitest fork diagnostic report summary',
    ) as { env?: Record<string, string>; if?: string; ['continue-on-error']?: boolean } | undefined

    expect(hostPressureStep?.if).toBe('failure()')
    expect(hostPressureStep?.['continue-on-error']).toBe(true)
    expect(hostPressureStep?.run).toContain('./ci/host-pressure-diagnostics.sh')
    expect(reportSummaryStep?.if).toBe('failure()')
    expect(reportSummaryStep?.['continue-on-error']).toBe(true)
    expect(reportSummaryStep?.env?.VITEST_FORK_DIAGNOSTIC_DIR).toBe(
      '.vitest-reports/fork-diagnostics-${{ matrix.shard }}',
    )

    // Never subscribed to the heavy slot for this diagnostics step — the coverage regression
    // test for that consumer set (heavy-slot-coverage.test.mts) is unmodified by this change.
    expect(backendJob).not.toContain('with-heavy-slot.sh')
  })

  it('does not restore or save a remote Vite transform cache', () => {
    // This self-hosted workflow relies solely on ./.github/actions/clean-workspace to
    // persist .cache/vite/vitest across runs; a remote actions/cache round-trip here
    // is redundant and was consuming a job's entire timeout budget.
    expect(workflow).not.toMatch(/actions\/cache\/(?:restore|save)|\.cache\/vite\/vitest/u)
  })

  it('resolves an unfiltered run for full_suite even when selected_test_files is unset', () => {
    // Regression test: a `full_suite && '' || (selected || sentinel)` GHA expression
    // here previously discarded the intentional empty string (falsy in GHA, same as
    // JS) and fell through to the sentinel — every full_suite=true push (the default,
    // used by every main push) silently selected zero test files. This exercises the
    // real bash conditional that replaced it, not just the YAML text.
    expect(runFilesArray({ FULL_SUITE: 'true', SELECTED_TEST_FILES: '' })).toEqual([])
  })

  it('passes through an explicit narrowed selection', () => {
    expect(
      runFilesArray({
        FULL_SUITE: 'false',
        SELECTED_TEST_FILES: 'backend/foo.test.mts\nbackend/bar.test.mts',
      }),
    ).toEqual(['backend/foo.test.mts', 'backend/bar.test.mts'])
  })

  it('falls back to a non-matching sentinel when narrowed with no selection', () => {
    expect(runFilesArray({ FULL_SUITE: 'false', SELECTED_TEST_FILES: '' })).toEqual([
      'NO_TESTS_MATCHING_SELECTION',
    ])
  })

  it('preserves selected file paths containing spaces or shell glob metacharacters', () => {
    // SELECTED_TEST_FILES is newline-delimited (vouchington-tooling/gha-selected-files's
    // encodeSelectedFiles); a space or a glob metacharacter (*, ?, [) inside a single
    // path must survive the quoted read-loop decode unchanged, not be word-split or
    // glob-expanded the way an unquoted $VAR previously was.
    expect(
      runFilesArray({
        FULL_SUITE: 'false',
        SELECTED_TEST_FILES:
          'backend/services/[id]/foo.test.mts\nbackend/needs space/bar.test.mts\nbackend/glob-*-star.test.mts',
      }),
    ).toEqual([
      'backend/services/[id]/foo.test.mts',
      'backend/needs space/bar.test.mts',
      'backend/glob-*-star.test.mts',
    ])
  })
})
