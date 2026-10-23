import { describe, expect, it } from 'vitest'

import { evaluateWorkflow as decide } from '../decide.mts'

import { rules, type WorkflowRunContext } from '../rules.mts'

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  jobNames: overrides.jobNames ?? overrides.failedJobNames ?? [],
  jobConclusions: new Map((overrides.failedJobNames ?? []).map(name => [name, 'failure'])),
  jobSteps: new Map(),
  failedJobLogFetchFailures: () => Promise.resolve(new Set()),
  jobLogs: () => overrides.failedJobLogs?.() ?? Promise.resolve(new Map()),
  failedJobAnnotationFetchFailures: () => Promise.resolve(new Set()),
  workflowName: 'Web',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('rules catalogue', () => {
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
        rules,
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
        rules,
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
        rules,
      )
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })
  })
})
