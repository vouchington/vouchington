// See docs/checklists/github-actions.md for when this check can be removed.
import { readdirSync, readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import {
  assertNoWorkflowViolations,
  type WorkflowStep,
} from '../test-helpers/workflow-fixtures.mts'

type Document = { jobs?: Record<string, { steps?: WorkflowStep[] }> }

const rootPath = (path: unknown): boolean => path === undefined || path === '.' || path === './'
const ownRepository = (repository: unknown): boolean =>
  repository === undefined ||
  /^\$\{\{\s*github\.repository\s*\}\}$/u.test(typeof repository === 'string' ? repository : '')

// A sparse checkout only fills `.github/actions` when a pattern covers it.
function sparseCoversActions(sparse: unknown): boolean {
  if (sparse === undefined) return true
  if (typeof sparse !== 'string') return false
  return sparse.split('\n').some(line => {
    const pattern = line.trim().replace(/^\/+|\/+$/gu, '')
    return (
      pattern === '.github' ||
      pattern === '.github/actions' ||
      pattern.startsWith('.github/actions/')
    )
  })
}

// Returns whether the checkout leaves the workspace root populated with this repository's
// `.github/actions` (true), replaces the root with another repository (false), or leaves the
// state unchanged (undefined): a conditional step, a `path:` checkout, or a non-covering sparse one.
function checkoutEffect(step: WorkflowStep): boolean | undefined {
  // A conditional checkout may be skipped while a later local action still runs.
  if (!step.uses?.startsWith('actions/checkout@') || step.if !== undefined) return undefined
  const { path, repository, 'sparse-checkout': sparse } = step.with ?? {}
  if (!rootPath(path)) return undefined
  if (!ownRepository(repository)) return false
  return sparseCoversActions(sparse) ? true : undefined
}

// A local composite action resolves from $GITHUB_WORKSPACE, which only an earlier checkout fills.
function localActionBeforeCheckoutViolations(path: string, document: Document): string[] {
  return Object.entries(document.jobs ?? {}).flatMap(([jobId, job]) => {
    let checkedOut = false
    const violations: string[] = []
    for (const [index, step] of (job.steps ?? []).entries()) {
      const effect = checkoutEffect(step)
      if (effect !== undefined) checkedOut = effect
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
    const local = { name: 'setup', uses: './.github/actions/setup-backend' }

    expect(
      localActionBeforeCheckoutViolations('wf', { jobs: { a: { steps: [local, checkout] } } }),
    ).toEqual(['wf#a step setup: ./.github/actions/setup-backend before checkout'])
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
    const local = { name: 'setup', uses: './.github/actions/setup-backend' }
    const violationCount = (extra: Record<string, string>) =>
      localActionBeforeCheckoutViolations('wf', {
        jobs: { a: { steps: [checkout(extra), local] } },
      }).length

    expect(
      localActionBeforeCheckoutViolations('wf', {
        jobs: { a: { steps: [{ ...checkout({}), if: "github.event_name == 'push'" }, local] } },
      }),
    ).toHaveLength(1)
    expect(violationCount({ 'sparse-checkout': 'src' })).toBe(1)
    expect(violationCount({ 'sparse-checkout': 'src\n.github/actions' })).toBe(0)
    expect(violationCount({ 'sparse-checkout': '.github' })).toBe(0)
    expect(
      localActionBeforeCheckoutViolations('wf', {
        jobs: { a: { steps: [checkout({}), checkout({ repository: 'other/repo' }), local] } },
      }),
    ).toHaveLength(1)
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
