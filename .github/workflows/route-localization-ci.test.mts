import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

describe('route localization CI wiring', () => {
  it('runs the live route catalog checker once after selector validation and preserves sibling guards', () => {
    const workflow = parse(readFileSync('.github/workflows/static-code-analysis.yml', 'utf8')) as {
      jobs: Record<string, { steps: { name?: string; run?: string; if?: unknown }[] }>
    }
    const steps = workflow.jobs['no-mistakes']!.steps
    const matches = Object.values(workflow.jobs).flatMap(job =>
      job.steps.filter(
        step => step.run?.trim() === 'node ci/check-live-web-route-localization.mts',
      ),
    )
    expect(matches).toHaveLength(1)
    expect(
      steps.filter(step => step.run?.trim() === 'node ci/check-live-web-route-localization.mts'),
    ).toHaveLength(1)
    expect(matches[0]?.if).toBeUndefined()
    const selector = steps.findIndex(
      step =>
        step.run?.trim() ===
        'node static-code-analysis/i18n-extract/route-selector-map.mts --check --diagnostics',
    )
    expect(selector).toBeGreaterThanOrEqual(0)
    expect(steps.indexOf(matches[0]!)).toBe(selector + 1)
    const staticSteps = workflow.jobs['static-code-analysis']!.steps
    expect(
      staticSteps.some(step => step.run?.trim() === 'node ci/check-live-native-resources.mts'),
    ).toBe(true)
    expect(
      staticSteps.some(
        step => step.run?.trim() === 'pnpm exec oxlint --type-aware --deny-warnings',
      ),
    ).toBe(true)
  })
})
