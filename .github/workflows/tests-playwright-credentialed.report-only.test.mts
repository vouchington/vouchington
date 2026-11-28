import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

// The credentialed Playwright job drives real cloud resources (an S3 upload, the image lambda), so
// like the backend live-provider job it reports a failure without gating the area
// (docs/development/tests.md#live-provider-smoke-checks). area-workflows.test.mts also lists it
// among the report-only suites; this file pins the rest of the wiring.
type Step = { uses?: string; with?: { results?: string } }
type Job = { needs?: string | string[]; steps?: Step[] }
const webJobs = (
  load(readFileSync('.github/workflows/web.yml', 'utf8')) as {
    jobs: Record<string, Job>
  }
).jobs
const needsOf = (id: string): string[] => [webJobs[id]?.needs ?? []].flat()

describe('web area wiring for the credentialed Playwright job', () => {
  it('keeps the job out of the required gate and its results', () => {
    const gateStep = webJobs.web!.steps?.find(step =>
      step.uses?.includes('ci-required-result-gate'),
    )
    const results = JSON.parse(String(gateStep?.with?.results)) as Record<string, unknown>

    expect(webJobs['test-playwright-credentialed']).toBeDefined()
    expect(needsOf('web')).not.toContain('test-playwright-credentialed')
    expect(results).not.toHaveProperty('test-playwright-credentialed')
  })

  it('keeps the job out of the coverage gate and the Codecov upload', () => {
    expect(needsOf('coverage')).not.toContain('test-playwright-credentialed')
    expect(needsOf('codecov')).not.toContain('test-playwright-credentialed')
  })

  it('is ignored by pr-shepherd, which blocks on every failing pull-request check', () => {
    const {
      checks: { ignore: ignoreChecks },
    } = load(readFileSync('.pr-shepherdrc.yml', 'utf8')) as {
      checks: { ignore: string[] }
    }

    expect(ignoreChecks).toContain('test-playwright-credentialed / playwright-credentialed-tests')
  })
})
