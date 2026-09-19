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
    it('ignores Main CI web selector cancellations when stateful fan-out jobs were skipped', async () => {
      const failedJobName = 'playwright-tests / select'
      const result = await decide(
        makeCtx({
          workflowName: 'Main CI (web)',
          conclusion: 'cancelled',
          jobNames: [failedJobName, 'build', 'main-pre-deploy-eligibility', 'deploy-web'],
          jobConclusions: new Map([
            [failedJobName, 'cancelled'],
            ['build', 'skipped'],
            ['main-pre-deploy-eligibility', 'skipped'],
            ['deploy-web', 'skipped'],
          ]),
          failedJobNames: [failedJobName],
        }),
        RULES,
      )
      expect(result.decision).toBe('ignore')
      expect(result.matchedRule).toBe('workflow-cancelled-without-failure-signal')
    })

    it('does not ignore Main CI web cancellations after a stateful deploy job completed', async () => {
      const failedJobName = 'playwright-tests / select'
      const result = await decide(
        makeCtx({
          workflowName: 'Main CI (web)',
          conclusion: 'cancelled',
          jobNames: [failedJobName, 'deploy-web'],
          jobConclusions: new Map([
            [failedJobName, 'cancelled'],
            ['deploy-web', 'success'],
          ]),
          failedJobNames: [failedJobName],
        }),
        RULES,
      )
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })

    it('does not ignore Main CI web cancellations after a stateful deploy job was cancelled', async () => {
      const failedJobName = 'playwright-tests / select'
      const result = await decide(
        makeCtx({
          workflowName: 'Main CI (web)',
          conclusion: 'cancelled',
          jobNames: [failedJobName, 'deploy-web'],
          jobConclusions: new Map([
            [failedJobName, 'cancelled'],
            ['deploy-web', 'cancelled'],
          ]),
          failedJobNames: [failedJobName, 'deploy-web'],
        }),
        RULES,
      )
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })
  })
})
