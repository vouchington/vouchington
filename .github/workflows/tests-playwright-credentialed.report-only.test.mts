import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

// The credentialed Playwright job drives real cloud resources (an S3 upload, the image lambda), so
// like the backend live-provider job it reports a failure without gating the area
// (docs/development/tests.md#live-provider-smoke-checks). area-workflows.test.mts also lists it
// among the report-only suites; this file pins the rest of the wiring.
type Step = {
  id?: string
  name?: string
  if?: string
  run?: string
  uses?: string
  with?: { results?: string }
}
type Job = { needs?: string | string[]; steps?: Step[]; uses?: string }
const readJobs = (path: string): Record<string, Job> =>
  (load(readFileSync(path, 'utf8')) as { jobs: Record<string, Job> }).jobs

const webJobs = readJobs('.github/workflows/web.yml')
const credentialedWorkflowText = readFileSync(
  '.github/workflows/tests-playwright-credentialed.yml',
  'utf8',
)
const credentialedJob = Object.values(
  readJobs('.github/workflows/tests-playwright-credentialed.yml'),
)[0]!
const needsOf = (id: string): string[] => [webJobs[id]?.needs ?? []].flat()
const stepNamed = (name: string): Step => {
  const step = credentialedJob.steps?.find(candidate => candidate.name === name)
  if (!step) throw new Error(`step not found: ${name}`)
  return step
}

describe('web area wiring for the credentialed Playwright job', () => {
  it('runs the job but keeps it out of the required gate and its results', () => {
    const gateStep = webJobs.web!.steps?.find(step =>
      step.uses?.includes('ci-required-result-gate'),
    )
    const results = JSON.parse(String(gateStep?.with?.results)) as Record<string, unknown>

    expect(webJobs['test-playwright-credentialed']?.uses).toBe(
      './.github/workflows/tests-playwright-credentialed.yml',
    )
    expect(needsOf('web')).not.toContain('test-playwright-credentialed')
    expect(results).not.toHaveProperty('test-playwright-credentialed')
  })

  it('keeps the job out of the coverage gate and the Codecov upload, and publishes no LCOV', () => {
    expect(needsOf('coverage')).not.toContain('test-playwright-credentialed')
    expect(needsOf('codecov')).not.toContain('test-playwright-credentialed')
    expect(credentialedWorkflowText).not.toContain('upload-full-lcov')
    expect(credentialedWorkflowText).not.toContain('VITEST_COVERAGE_ENABLED')
  })

  it('is ignored by pr-shepherd, which blocks on every failing pull-request check', () => {
    const { ignoreChecks } = load(readFileSync('.pr-shepherdrc.yml', 'utf8')) as {
      ignoreChecks: string[]
    }

    expect(ignoreChecks).toContain('test-playwright-credentialed / playwright-credentialed-tests')
  })

  it('reports a failure as a warning and a summary without hiding the failed job', () => {
    const report = stepNamed('Report non-gating smoke check failure')

    // `failure()` is required: without a status function the condition adds an implicit `success()`
    // and the step would be skipped on exactly the failure it reports.
    expect(report.if).toBe(
      "${{ failure() && steps.run-playwright-credentialed.outcome == 'failure' }}",
    )
    expect(report.run).toContain('::warning title=')
    expect(report.run).toContain('>> "$GITHUB_STEP_SUMMARY"')
    // The test step stays a hard failure: a red job keeps the check and the Nightly alert visible.
    expect(stepNamed('Run Playwright credentialed tests')).not.toHaveProperty('continue-on-error')
  })
})
