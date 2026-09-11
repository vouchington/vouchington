import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import type { TransientRetryRule, WorkflowRunContext } from './types.mts'

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

const alwaysMatchRule = (
  id: string,
  maxAttempts = 1,
  decision?: 'rerun' | 'ignore',
): TransientRetryRule => ({
  id,
  consumerKey: 'test',
  rootCauseKey: 'test',
  description: `Always-match rule ${id}`,
  rationale: 'Test fixture',
  maxAttempts,
  decision,
  match: () => true,
})

describe('decide() attempt accounting', () => {
  it('uses per-rule attempts for every rerun decision', async () => {
    const result = await decide(
      makeCtx({
        runAttempt: 4,
        ruleAttempt: 4,
        ruleAttempts: new Map([['late-first', 1]]),
      }),
      [alwaysMatchRule('late-first')],
    )

    expect(result).toEqual({ decision: 'rerun', matchedRule: 'late-first' })
  })

  it('falls back to the shared rule attempt when a rerun rule has no reconstructed count', async () => {
    const result = await decide(
      makeCtx({ runAttempt: 4, ruleAttempt: 3, ruleAttempts: new Map() }),
      [alwaysMatchRule('missing-count', 2)],
    )

    expect(result).toEqual({ decision: 'dispatch', matchedRule: '' })
  })

  it.each(['ignore'] as const)(
    'keeps shared-attempt accounting for %s decisions',
    async decision => {
      const result = await decide(
        makeCtx({
          runAttempt: 4,
          ruleAttempt: 4,
          ruleAttempts: new Map([['non-rerun', 1]]),
        }),
        [alwaysMatchRule('non-rerun', 1, decision)],
      )

      expect(result).toEqual({ decision: 'dispatch', matchedRule: '' })
    },
  )
})
