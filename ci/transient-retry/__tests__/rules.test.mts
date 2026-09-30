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
    it('ignores Main CI web publication-selector cancellations when publication jobs were skipped', async () => {
      const failedJobName = 'detect-image-publication'
      const result = await decide(
        makeCtx({
          workflowName: 'Main CI (web)',
          conclusion: 'cancelled',
          jobNames: [failedJobName, 'publish-web-images / build', 'web-deploy-intent'],
          jobConclusions: new Map([
            [failedJobName, 'cancelled'],
            ['publish-web-images / build', 'skipped'],
            ['web-deploy-intent', 'skipped'],
          ]),
          failedJobNames: [failedJobName],
        }),
        RULES,
      )
      expect(result.decision).toBe('ignore')
      expect(result.matchedRule).toBe('workflow-cancelled-without-failure-signal')
    })

    it('does not ignore Main CI web cancellations after a stateful deploy job completed', async () => {
      const failedJobName = 'detect-image-publication'
      const result = await decide(
        makeCtx({
          workflowName: 'Main CI (web)',
          conclusion: 'cancelled',
          jobNames: [failedJobName, 'publish-web-images / build'],
          jobConclusions: new Map([
            [failedJobName, 'cancelled'],
            ['publish-web-images / build', 'success'],
          ]),
          failedJobNames: [failedJobName],
        }),
        RULES,
      )
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })

    it('does not ignore Main CI web cancellations after a stateful deploy job was cancelled', async () => {
      const failedJobName = 'detect-image-publication'
      const result = await decide(
        makeCtx({
          workflowName: 'Main CI (web)',
          conclusion: 'cancelled',
          jobNames: [failedJobName, 'publish-web-images / build'],
          jobConclusions: new Map([
            [failedJobName, 'cancelled'],
            ['publish-web-images / build', 'cancelled'],
          ]),
          failedJobNames: [failedJobName, 'publish-web-images / build'],
        }),
        RULES,
      )
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })
  })
})
