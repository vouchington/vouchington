import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import { backendCredentialedProjectNames } from '../../test-helpers/vitest-config/backend-credentialed-project-info.mts'

// The exact `vitest run --project ...` command is asserted against the shared project list in
// ci/transient-retry/backend-credentialed-config-agreement.test.mts.
const workflow = readFileSync('.github/workflows/tests-backend-credentialed.yml', 'utf8')

function jobSection(jobName: string): string {
  const start = workflow.indexOf(`\n  ${jobName}:`)
  if (start < 0) throw new Error(`job not found: ${jobName}`)
  const rest = workflow.slice(start + 1)
  const next = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/)
  return next === -1 ? rest : rest.slice(0, next)
}

function stepSection(job: string, stepName: string): string {
  const nameIndex = job.indexOf(`name: ${stepName}`)
  if (nameIndex < 0) throw new Error(`step not found: ${stepName}`)
  const start = job.lastIndexOf('\n      - ', nameIndex)
  if (start < 0) throw new Error(`step boundary not found: ${stepName}`)
  const rest = job.slice(start + 1)
  const next = rest.indexOf('\n      - ', 1)
  return next === -1 ? rest : rest.slice(0, next)
}

describe('backend credentialed test workflow', () => {
  it('combines the credentialed projects in one job', () => {
    const credentialedJob = jobSection('backend-credentialed-tests')
    expect(credentialedJob).toContain('if: ${{ inputs.trusted_secret_context }}')
    expect(credentialedJob).toContain('AWS_REGION: us-west-2')
    expect(credentialedJob).toContain('AWS_TEST_ROLE_ARN: ${{ secrets.AWS_TEST_ROLE_ARN }}')
    expect(credentialedJob).toContain("REQUIRE_BEDROCK_INTEGRATION: ''")

    expect(credentialedJob).toContain('OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}')
    expect(credentialedJob).toContain('OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}')
    expect(credentialedJob).toContain('STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}')
    expect(credentialedJob).toContain('.github/actions/setup-aws')
    expect(credentialedJob).toContain(
      'VITEST_JUNIT_OUTPUT_FILE: backend-credentialed-test-report.junit.xml',
    )
    for (const project of backendCredentialedProjectNames) {
      expect(workflow).not.toContain(`${project}-tests:`)
    }
  })

  it('does not shard the credentialed job', () => {
    expect(workflow).not.toContain('--shard')
  })

  it('gates the job on trusted_secret_context', () => {
    expect(workflow).toContain('inputs.trusted_secret_context')
    expect(workflow).toContain('OPENAI_API_KEY:\n        required: false')
    expect(workflow).toContain('OPENROUTER_API_KEY:\n        required: false')
    expect(workflow).toContain('STRIPE_SECRET_KEY:\n        required: false')
  })

  // Live provider calls are smoke checks, not a gate. Recorded-response fixtures in the unit suites
  // gate the same behavior and own its coverage (docs/development/tests.md#live-provider-smoke-checks).
  it('publishes no coverage, so the area coverage gate never depends on live providers', () => {
    expect(workflow).not.toContain('publish_coverage')
    expect(workflow).not.toContain('upload-full-lcov')
    expect(workflow).not.toContain('coverage-full')
    expect(workflow.match(/VITEST_COVERAGE_ENABLED: .*/g)).toEqual([
      "VITEST_COVERAGE_ENABLED: 'false'",
      "VITEST_COVERAGE_ENABLED: 'false'",
    ])
  })

  it('reports a failure as a warning and a summary without hiding the failed job', () => {
    const credentialedJob = jobSection('backend-credentialed-tests')
    const report = stepSection(credentialedJob, 'Report non-gating smoke check failure')

    // `failure()` is required: without a status function the condition adds an implicit `success()`
    // and the step would be skipped on exactly the failure it reports.
    expect(report).toContain('if: ${{ failure() && (')
    expect(report).toContain("steps.credentialed-tests.outcome == 'failure'")
    expect(report).toContain("steps.anthropic-tests.outcome == 'failure'")
    expect(report).toContain('::warning title=Live provider smoke check failed::')
    expect(report).toContain('>> "$GITHUB_STEP_SUMMARY"')
    // The test steps stay hard failures: a red job keeps the Nightly alert and the check visible.
    expect(stepSection(credentialedJob, 'Run backend credentialed tests')).not.toContain(
      'continue-on-error',
    )
    expect(stepSection(credentialedJob, 'Run Anthropic credentialed tests')).not.toContain(
      'continue-on-error',
    )
  })
})

type AreaJob = {
  needs?: string | string[]
  with?: Record<string, unknown>
  steps?: Array<{ uses?: string; with?: { results?: string } }>
}
const backendJobs = (
  load(readFileSync('.github/workflows/backend.yml', 'utf8')) as {
    jobs: Record<string, AreaJob>
  }
).jobs
const needsOf = (id: string): string[] => [backendJobs[id]?.needs ?? []].flat()

describe('backend area wiring for the live-provider smoke checks', () => {
  it('runs the credentialed job but keeps it out of the required gate and its results', () => {
    const gate = backendJobs.backend!
    const results = JSON.parse(String(gate.steps?.[0]?.with?.results)) as Record<string, unknown>

    expect(backendJobs['test-backend-credentialed']).toBeDefined()
    expect(needsOf('backend')).not.toContain('test-backend-credentialed')
    expect(results).not.toHaveProperty('test-backend-credentialed')
  })

  it('keeps live-provider results out of the coverage gate and the Codecov upload', () => {
    const uploads = JSON.parse(String(backendJobs.codecov!.with?.uploads)) as Array<{
      flag: string
    }>

    expect(backendJobs['test-backend-credentialed']!.with).not.toHaveProperty('publish_coverage')
    expect(needsOf('coverage')).not.toContain('test-backend-credentialed')
    expect(needsOf('codecov')).not.toContain('test-backend-credentialed')
    expect(uploads.map(upload => upload.flag)).not.toContain('backend-credentialed')
  })

  it('is ignored by pr-shepherd, which blocks on every failing pull-request check', () => {
    const { ignoreChecks } = load(readFileSync('.pr-shepherdrc.yml', 'utf8')) as {
      ignoreChecks: string[]
    }

    expect(ignoreChecks).toContain('test-backend-credentialed / backend-credentialed-tests')
  })
})
