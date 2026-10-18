// Interim: remove once jonathanong/no-mistakes#2182 ships the generic rule.
import { readdirSync, readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import {
  assertNoWorkflowViolations,
  type WorkflowStep,
} from '../test-helpers/workflow-fixtures.mts'

type Document = { jobs?: Record<string, { steps?: WorkflowStep[] }> }

// Only a checkout of this repository into the workspace root fills the workspace; a `path:` or a
// foreign `repository:` leaves `./.github/actions` unresolved.
function populatesWorkspaceRoot(step: WorkflowStep): boolean {
  if (!step.uses?.startsWith('actions/checkout@')) return false
  const { path, repository } = (step.with ?? {}) as { path?: unknown; repository?: unknown }
  const rootPath = path === undefined || path === '.' || path === './'
  const ownRepository =
    repository === undefined ||
    /^\$\{\{\s*github\.repository\s*\}\}$/u.test(typeof repository === 'string' ? repository : '')
  return rootPath && ownRepository
}

// A local composite action resolves from $GITHUB_WORKSPACE, which only an earlier checkout fills.
function localActionBeforeCheckoutViolations(path: string, document: Document): string[] {
  return Object.entries(document.jobs ?? {}).flatMap(([jobId, job]) => {
    let checkedOut = false
    const violations: string[] = []
    for (const [index, step] of (job.steps ?? []).entries()) {
      if (populatesWorkspaceRoot(step)) checkedOut = true
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

  it('counts only a root checkout of this repository', () => {
    const checkout = (extra: Record<string, string>) => ({
      uses: `actions/checkout@${'0'.repeat(40)}`,
      with: extra,
    })
    const local = { name: 'setup', uses: './.github/actions/setup-node-pnpm' }
    const violationCount = (extra: Record<string, string>) =>
      localActionBeforeCheckoutViolations('wf', {
        jobs: { a: { steps: [checkout(extra), local] } },
      }).length

    expect(violationCount({ path: 'candidate' })).toBe(1)
    expect(violationCount({ repository: 'other/repo' })).toBe(1)
    expect(violationCount({ path: '.', repository: '${{ github.repository }}' })).toBe(0)
    expect(violationCount({ path: './' })).toBe(0)
    expect(violationCount({})).toBe(0)
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
