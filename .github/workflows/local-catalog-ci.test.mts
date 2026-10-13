import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

describe('repository catalog and reference checks', () => {
  it('runs each full-tree check once in static CI with its own deadline', () => {
    const workflow = parse(readFileSync('.github/workflows/static-code-analysis.yml', 'utf8')) as {
      jobs: Record<string, { steps: { run?: string; 'timeout-minutes'?: number }[] }>
    }
    const steps = workflow.jobs['static-code-analysis']!.steps
    for (const command of [
      'node dev/localization/local-catalog.mts',
      'node ci/check-live-form-keyboard-reference.mts',
    ]) {
      const selected = steps.filter(step => step.run === command)
      expect(selected).toHaveLength(1)
      expect(selected[0]!['timeout-minutes']).toBeGreaterThan(0)
      expect(selected[0]!['timeout-minutes']).toBeLessThanOrEqual(2)
    }
  })
})
