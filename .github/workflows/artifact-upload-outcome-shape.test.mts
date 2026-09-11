import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { parse as loadYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

const EXPECTED_RUN =
  'node ci/artifact-upload-outcome.mts "$FAMILY" "$SUITE" "$FIRST_OUTCOME" "$RETRY_OUTCOME"'
const FAMILIES = new Set(['coverage-pair', 'vitest-blob', 'vitest-report-attempt'])
const workflowsDir = '.github/workflows'

type OutcomeStep = {
  name?: string
  id?: string
  run?: string
  env?: Record<string, unknown>
}
type ProducerWorkflow = { jobs?: Record<string, { steps?: OutcomeStep[] }> }

// Every artifact-upload family's terminal outcome step must reduce to this one call shape (plan:
// "Simplify the GitHub-artifact upload retry"). A step whose env block drifts from this shape would
// still lint and typecheck — only this test catches the re-divergence the consolidation exists to
// prevent.
function outcomeSteps(): OutcomeStep[] {
  return readdirSync(workflowsDir)
    .filter(file => file.endsWith('.yml'))
    .flatMap(file => {
      const workflow = loadYaml(readFileSync(join(workflowsDir, file), 'utf8')) as ProducerWorkflow
      return Object.values(workflow.jobs ?? {}).flatMap(job =>
        (job.steps ?? []).filter(step => step.run === EXPECTED_RUN),
      )
    })
}

describe('artifact-upload-outcome.mts call sites', () => {
  it('all use the identical run string and a well-formed env block', () => {
    const steps = outcomeSteps()

    // 15 vitest-blob + 14 coverage-pair + 14 vitest-report-attempt triads across the 13 producers.
    // A correctly-shaped new producer legitimately bumps these counts — update them deliberately
    // rather than treating the failure as a defect.
    expect(steps).toHaveLength(43)

    for (const step of steps) {
      expect(step.run).toBe(EXPECTED_RUN)
      expect(Object.keys(step.env ?? {}).sort()).toEqual([
        'FAMILY',
        'FIRST_OUTCOME',
        'RETRY_OUTCOME',
        'SUITE',
      ])

      const env = step.env ?? {}
      expect(FAMILIES.has(env.FAMILY as string)).toBe(true)
      expect(typeof env.SUITE).toBe('string')
      expect((env.SUITE as string).length).toBeGreaterThan(0)
      expect(env.FIRST_OUTCOME).toMatch(/^\$\{\{ steps\.[\w-]+\.outcome \}\}$/)
      expect(env.RETRY_OUTCOME).toMatch(/^\$\{\{ steps\.[\w-]+\.outcome \}\}$/)
    }

    const familyCounts = new Map<string, number>()
    for (const step of steps) {
      const family = step.env?.FAMILY as string
      familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1)
    }
    expect(familyCounts.get('vitest-blob')).toBe(15)
    expect(familyCounts.get('coverage-pair')).toBe(14)
    expect(familyCounts.get('vitest-report-attempt')).toBe(14)
  })
})
