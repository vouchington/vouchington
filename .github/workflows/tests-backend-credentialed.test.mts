import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import { backendCredentialedProjectNames } from '../../test-helpers/vitest-config/backend-credentialed-project-info.mts'

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
  it('runs only the real-AWS project; paid providers live in tests-backend-live-providers.yml', () => {
    const job = jobSection('backend-credentialed-tests')
    const runText = stepSection(job, 'Run backend credentialed tests')
    const projectFlags = [...runText.matchAll(/--project\s+(\S+)/g)].map(([, name]) => name)

    expect(projectFlags).toEqual(['backend-aws'])
    expect(backendCredentialedProjectNames).toContain('backend-aws')
    expect(workflow).not.toMatch(/OPENAI_API_KEY|OPENROUTER_API_KEY|LIGHTPANDA_TOKEN|ANTHROPIC/)
  })

  it('retains a best-effort JUnit report after the run', () => {
    const parsed = load(workflow) as {
      jobs: Record<string, { steps: Array<Record<string, unknown>> }>
    }
    const steps = parsed.jobs['backend-credentialed-tests']!.steps
    const runIndex = steps.findIndex(step => step.name === 'Run backend credentialed tests')

    expect(runIndex).toBeGreaterThanOrEqual(0)
    expect(steps[runIndex + 1]).toMatchObject({
      if: '${{ !cancelled() }}',
      'continue-on-error': true,
      with: { path: 'backend-credentialed-test-report.junit.xml' },
    })
  })

  // Live provider calls are smoke checks, not a gate. Recorded-response fixtures in the unit suites
  // gate the same behavior and own its coverage (docs/development/tests.md#live-provider-smoke-checks).
  it('publishes no coverage, so the area coverage gate never depends on live providers', () => {
    expect(workflow).not.toContain('publish_coverage')
    expect(workflow).not.toContain('upload-full-lcov')
    expect(workflow.match(/VITEST_COVERAGE_ENABLED: .*/g)).toEqual([
      "VITEST_COVERAGE_ENABLED: 'false'",
    ])
  })

  it('reports a failure as a warning and a summary without hiding the failed job', () => {
    const credentialedJob = jobSection('backend-credentialed-tests')
    const report = stepSection(credentialedJob, 'Report non-gating smoke check failure')

    // `failure()` is required: without a status function the condition adds an implicit `success()`
    // and the step would be skipped on exactly the failure it reports.
    expect(report).toContain('if: ${{ failure() && (')
    expect(report).toContain('::warning title=Live provider smoke check failed::')
    expect(report).toContain('>> "$GITHUB_STEP_SUMMARY"')
    // The test step stays a hard failure: a red job keeps the Nightly alert and the check visible.
    expect(stepSection(credentialedJob, 'Run backend credentialed tests')).not.toContain(
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
    const {
      checks: { ignore: ignoreChecks },
    } = load(readFileSync('.pr-shepherdrc.yml', 'utf8')) as {
      checks: { ignore: string[] }
    }

    expect(ignoreChecks).toContain('test-backend-credentialed / backend-credentialed-tests')
  })
})
