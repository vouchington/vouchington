import { describe, expect, it } from 'vitest'

import { decide } from '../decide.mts'

import { RULES, type WorkflowRunContext } from '../rules.mts'

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('RULES catalogue', () => {
  describe('workflow-cancelled-without-failure-signal', () => {
    it.each([
      ['CI', 1],
      ['Main CI (checks)', 2],
      ['Main CI (web)', 2],
      ['Portability Tests', 1],
      ['Static Code Analysis', 1],
    ])('ignores a cancelled %s run that has no created jobs', async (workflowName, runAttempt) => {
      const ctx = makeCtx({
        workflowName,
        conclusion: 'cancelled',
        runAttempt,
        jobNames: [],
        failedJobNames: [],
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('ignore')
      expect(result.matchedRule).toBe('workflow-cancelled-without-failure-signal')
    })

    it('does not ignore cancellations whose job conclusion is unavailable', async () => {
      const ctx = makeCtx({
        conclusion: 'cancelled',
        runAttempt: 1,
        jobNames: ['test-web / web-tests (1)'],
        failedJobNames: ['test-web / web-tests (1)'],
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })
  })
})
