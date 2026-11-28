import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import { backendCredentialedProjectNames } from '../../test-helpers/vitest-config/backend-credentialed-project-info.mts'

const workflow = readFileSync('.github/workflows/tests-backend-credentialed.yml', 'utf8')

describe('backend credentialed test workflow', () => {
  it('runs only projects registered as credentialed', () => {
    const projectFlags = [...workflow.matchAll(/--project\s+(\S+)/g)].map(([, name]) => name)

    expect(projectFlags.length).toBeGreaterThan(0)
    for (const name of projectFlags) expect(backendCredentialedProjectNames).toContain(name)
    // Paid providers live in tests-backend-live-providers.yml.
    expect(workflow).not.toMatch(/OPENAI_API_KEY|OPENROUTER_API_KEY|LIGHTPANDA_TOKEN|ANTHROPIC/)
  })

  it('reports a failure without hiding the failed job', () => {
    const steps = (
      load(workflow) as {
        jobs: Record<
          string,
          { steps: Array<{ name?: string; if?: string } & Record<string, unknown>> }
        >
      }
    ).jobs['backend-credentialed-tests']!.steps
    const report = steps.find(step => step.name === 'Report non-gating smoke check failure')
    const run = steps.find(step => step.name === 'Run backend credentialed tests')

    // Without a status function the condition adds an implicit `success()` and never runs on failure.
    expect(report?.if).toMatch(/^\$\{\{ failure\(\) && \(/)
    // The test step stays a hard failure: a red job keeps the Nightly alert and the check visible.
    expect(run).toBeDefined()
    expect(run).not.toHaveProperty('continue-on-error')
  })

  it('retains a best-effort JUnit report after the run', () => {
    const parsed = load(workflow) as {
      jobs: Record<
        string,
        { steps: Array<Record<string, unknown> & { env?: Record<string, string> }> }
      >
    }
    const steps = parsed.jobs['backend-credentialed-tests']!.steps
    const runIndex = steps.findIndex(step => step.name === 'Run backend credentialed tests')

    expect(runIndex).toBeGreaterThanOrEqual(0)
    expect(steps[runIndex + 1]).toMatchObject({
      if: '${{ !cancelled() }}',
      'continue-on-error': true,
      with: { path: steps[runIndex]?.env?.VITEST_JUNIT_OUTPUT_FILE },
    })
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
