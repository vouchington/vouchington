import { describe, expect, it } from 'vitest'

import { decide } from '../decide.mts'

import { RULES, type WorkflowRunContext } from '../rules.mts'

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Web',
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
      ['Web', 1],
      ['Main CI (web)', 2],
      ['Portability Tests', 1],
      ['Static Code Analysis', 1],
      // Run 36330788166 was cancelled before GitHub created the audit job.
      ['Plan completion advisory', 1],
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

    it('ignores a cancelled Plan completion advisory audit job', async () => {
      const result = await decide(
        makeCtx({
          workflowName: 'Plan completion advisory',
          conclusion: 'cancelled',
          jobNames: ['audit'],
          jobConclusions: new Map([['audit', 'cancelled']]),
          failedJobNames: ['audit'],
        }),
        RULES,
      )
      expect(result.decision).toBe('ignore')
      expect(result.matchedRule).toBe('workflow-cancelled-without-failure-signal')
    })

    it('does not ignore a failed Plan completion advisory audit', async () => {
      const result = await decide(
        makeCtx({
          workflowName: 'Plan completion advisory',
          conclusion: 'failure',
          jobNames: ['audit'],
          jobConclusions: new Map([['audit', 'failure']]),
          failedJobNames: ['audit'],
        }),
        RULES,
      )
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })

    it('does not ignore a timed-out Plan completion advisory audit', async () => {
      const result = await decide(
        makeCtx({
          workflowName: 'Plan completion advisory',
          conclusion: 'timed_out',
          jobNames: ['audit'],
          jobConclusions: new Map([['audit', 'timed_out']]),
          failedJobNames: ['audit'],
        }),
        RULES,
      )
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })

    it('does not ignore a Plan completion cancellation after the audit job failed', async () => {
      const result = await decide(
        makeCtx({
          workflowName: 'Plan completion advisory',
          conclusion: 'cancelled',
          jobNames: ['audit'],
          jobConclusions: new Map([['audit', 'failure']]),
          failedJobNames: ['audit'],
        }),
        RULES,
      )
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })
  })
})
