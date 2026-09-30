import { describe, expect, it } from 'vitest'

import { parsedDependabot } from '../test-helpers/fix-dependabot.fixtures.mts'

type Completion = {
  branch: string
  workflowId: number
  headSha: string
  conclusion: 'failure' | 'success'
}

const group = parsedDependabot.concurrency?.group

function lockKey(completion: Completion): string {
  if (!group) throw new Error('Fix Dependabot must declare a concurrency group')
  return group
    .replaceAll('${{ github.event.workflow_run.head_branch }}', completion.branch)
    .replaceAll('${{ github.event.workflow_run.workflow_id }}', String(completion.workflowId))
    .replaceAll('${{ github.event.workflow_run.head_sha }}', completion.headSha)
}

function schedule(completions: readonly Completion[]) {
  const active = new Map<string, Completion>()
  const pending = new Map<string, Completion>()

  for (const completion of completions) {
    const key = lockKey(completion)
    if (active.has(key)) pending.set(key, completion)
    else active.set(key, completion)
  }

  return { active, pending }
}

describe('Fix Dependabot source concurrency', () => {
  const branch = 'dependabot/npm_and_yarn/example'
  const backendFailure: Completion = {
    branch,
    workflowId: 101,
    headSha: 'a'.repeat(40),
    conclusion: 'failure',
  }
  const rebasedBackendFailure: Completion = { ...backendFailure, headSha: 'b'.repeat(40) }
  const webSuccess: Completion = {
    branch,
    workflowId: 202,
    headSha: 'b'.repeat(40),
    conclusion: 'success',
  }

  it('keeps a pending Backend failure when Web succeeds on the same branch', () => {
    const { active, pending } = schedule([backendFailure, rebasedBackendFailure, webSuccess])

    expect(active.get(lockKey(backendFailure))).toEqual(backendFailure)
    expect(pending.get(lockKey(backendFailure))).toEqual(rebasedBackendFailure)
    expect(active.get(lockKey(webSuccess))).toEqual(webSuccess)
    expect(lockKey(backendFailure)).not.toBe(lockKey(webSuccess))
    expect(parsedDependabot.concurrency?.['cancel-in-progress']).toBe(false)
    expect(parsedDependabot.concurrency).not.toHaveProperty('queue')
  })

  it('replaces only the pending completion from the same source workflow', () => {
    const { active, pending } = schedule([
      backendFailure,
      { ...backendFailure, conclusion: 'success' },
      rebasedBackendFailure,
    ])

    expect(active.get(lockKey(backendFailure))).toEqual(backendFailure)
    expect(pending.get(lockKey(backendFailure))).toEqual(rebasedBackendFailure)
    expect(active.size).toBe(1)
    expect(pending.size).toBe(1)
  })

  it('separates different Dependabot branches for the same source workflow', () => {
    const otherBranch: Completion = { ...backendFailure, branch: 'dependabot/npm_and_yarn/other' }
    const { active, pending } = schedule([backendFailure, otherBranch])

    expect(active.get(lockKey(backendFailure))).toEqual(backendFailure)
    expect(active.get(lockKey(otherBranch))).toEqual(otherBranch)
    expect(active.size).toBe(2)
    expect(pending.size).toBe(0)
  })
})
