// Interim: remove once jonathanong/no-mistakes#2182 ships the generic rule.
import { readdirSync, readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import {
  assertNoWorkflowViolations,
  type WorkflowStep,
} from '../test-helpers/workflow-fixtures.mts'

type Document = { jobs?: Record<string, { steps?: WorkflowStep[] }> }

// A local composite action resolves from $GITHUB_WORKSPACE, which only an earlier checkout fills.
function localActionBeforeCheckoutViolations(path: string, document: Document): string[] {
  return Object.entries(document.jobs ?? {}).flatMap(([jobId, job]) => {
    let checkedOut = false
    const violations: string[] = []
    for (const [index, step] of (job.steps ?? []).entries()) {
      if (step.uses?.startsWith('actions/checkout@')) checkedOut = true
      else if (step.uses?.startsWith('./.github/actions/') && !checkedOut) {
        violations.push(`${path}#${jobId} step ${step.name ?? index}: ${step.uses} before checkout`)
      }
    }
    return violations
  })
}

describe('local composite actions require a checkout', () => {
  it('flags a local action without a preceding checkout in the same job', () => {
    const checkout = { uses: `actions/checkout@${'0'.repeat(40)}` }
    const local = { name: 'setup', uses: './.github/actions/setup-node-pnpm' }

    expect(
      localActionBeforeCheckoutViolations('wf', { jobs: { a: { steps: [local, checkout] } } }),
    ).toEqual(['wf#a step setup: ./.github/actions/setup-node-pnpm before checkout'])
    expect(
      localActionBeforeCheckoutViolations('wf', { jobs: { a: { steps: [local] } } }),
    ).toHaveLength(1)
    expect(
      localActionBeforeCheckoutViolations('wf', {
        jobs: { a: { steps: [checkout, local] }, b: { steps: [{ run: 'true' }] } },
      }),
    ).toEqual([])
  })

  it('checks out before every local action in every workflow job', () => {
    const violations = readdirSync('.github/workflows')
      .filter(file => /\.ya?ml$/u.test(file))
      .flatMap(file => {
        const path = `.github/workflows/${file}`
        return localActionBeforeCheckoutViolations(
          path,
          load(readFileSync(path, 'utf8')) as Document,
        )
      })

    assertNoWorkflowViolations(violations)
  })
})
