import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = {
  name?: string
  uses?: string
  run?: string
  if?: string
  'timeout-minutes'?: number
  'working-directory'?: string
  with?: Record<string, unknown>
}

const workflow = parse(
  readFileSync('.github/workflows/postgresql-snapshot-update.yml', 'utf8'),
) as { jobs: { generate: { steps: Step[] } } }

// Candidate installation and migrations execute PR code; neither may supply a later trusted wrapper
// or the manifest validator. A fresh same-workflow checkout restores each trust boundary.
describe('snapshot generation trusted code boundaries', () => {
  it('refreshes trusted scripts after candidate installation and the validator after generation', () => {
    const steps = workflow.jobs.generate.steps
    const connection = steps.findIndex(step => step.name === 'Set fresh PostgreSQL connection')
    const install = steps.findIndex(step => step.name === 'Install candidate dependencies')
    const generation = steps.findIndex(
      step => step.name === 'Generate snapshot from fresh PostgreSQL',
    )
    const manifest = steps.findIndex(
      step => step.name === 'Package generated snapshot with provenance',
    )
    const scriptCheckouts = steps
      .map((step, index) => ({ step, index }))
      .filter(({ step }) => step.with?.path === '.trusted-snapshot-scripts')
    const validator = steps.findIndex(step => step.with?.path === '.trusted-snapshot-tooling')

    expect(scriptCheckouts).toHaveLength(2)
    expect(connection).toBeGreaterThan(0)
    expect(scriptCheckouts[0]?.index).toBe(connection - 1)
    expect(install).toBeGreaterThan(connection)
    expect(scriptCheckouts[1]?.index).toBe(generation - 1)
    expect(generation - 1).toBeGreaterThan(install)
    expect(validator).toBe(generation + 1)
    expect(manifest).toBe(validator + 1)

    for (const { step } of scriptCheckouts) {
      expect(step.uses).toMatch(/^actions\/checkout@[0-9a-f]{40}$/)
      expect(step.if).toBeUndefined()
      expect(step['timeout-minutes']).toBeLessThanOrEqual(3)
      expect(step.with).toEqual({
        ref: '${{ github.sha }}',
        path: '.trusted-snapshot-scripts',
        'persist-credentials': false,
      })
    }
    expect(steps[validator]?.uses).toMatch(/^actions\/checkout@[0-9a-f]{40}$/)
    expect(steps[validator]?.if).toBeUndefined()
    expect(steps[validator]?.with).toEqual({
      ref: '${{ github.sha }}',
      path: '.trusted-snapshot-tooling',
      'persist-credentials': false,
    })
    expect(steps[connection]?.run).toBe(
      'source "$GITHUB_WORKSPACE/.trusted-snapshot-scripts/.github/workflows/set-snapshot-postgres-connection.sh"',
    )
    expect(steps[generation]?.run).toBe(
      'source "$GITHUB_WORKSPACE/.trusted-snapshot-scripts/.github/workflows/generate-postgresql-snapshot.sh"',
    )
    expect(steps[generation]?.['working-directory']).toBe('backend')
    expect(steps[manifest]?.run).toBe(
      'node .trusted-snapshot-tooling/ci/postgresql-snapshot-update.mts manifest',
    )
  })
})
