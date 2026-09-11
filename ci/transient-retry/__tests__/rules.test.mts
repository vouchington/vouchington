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
  describe('runner-shutdown-leaf-rerun annotation fallback', () => {
    const webIntegrationJobName = 'test-web-integration / web-integration-tests (1)'
    const runnerLossAnnotation =
      'The self-hosted runner lost communication with the server. Verify the machine is running and has a healthy network connection. Anything in your workflow that terminates the runner process, starves it for CPU/Memory, or blocks its network access can cause this error.'

    it('matches web integration runner communication loss on attempt 1', async () => {
      const ctx = makeCtx({
        failedJobNames: [webIntegrationJobName, 'Patch Coverage', 'tests', 'build'],
        failedJobAnnotations: jobName =>
          Promise.resolve(jobName === webIntegrationJobName ? [runnerLossAnnotation] : []),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('runner-shutdown-leaf-rerun')
    })

    it('does not match when an unsuccessful log could not be fetched', async () => {
      const jobName = webIntegrationJobName
      const ctx = makeCtx({
        failedJobNames: [jobName, 'Patch Coverage', 'tests', 'build'],
        failedJobLogFetchFailures: () => Promise.resolve(new Set(['Patch Coverage'])),
        failedJobAnnotations: name =>
          Promise.resolve(name === jobName ? [runnerLossAnnotation] : []),
      })

      expect(await decide(ctx, RULES)).toEqual({ decision: 'dispatch', matchedRule: '' })
    })

    it('does not match web integration failures without the runner-loss annotation', async () => {
      const ctx = makeCtx({
        failedJobNames: [webIntegrationJobName, 'Patch Coverage', 'tests', 'build'],
        failedJobAnnotations: jobName =>
          Promise.resolve(
            jobName === webIntegrationJobName ? ['Process completed with exit code 1.'] : [],
          ),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })

    it('does not match runner communication loss when the log has a real failure', async () => {
      const jobName = webIntegrationJobName
      const ctx = makeCtx({
        failedJobNames: [jobName, 'Patch Coverage', 'tests', 'build'],
        failedJobLogs: () =>
          Promise.resolve(new Map([[jobName, '##[error]Process completed with exit code 1.']])),
        failedJobAnnotations: name =>
          Promise.resolve(name === jobName ? [runnerLossAnnotation] : []),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })

    it('does not match when an additional non-aggregate job fails', async () => {
      const ctx = makeCtx({
        failedJobNames: [
          webIntegrationJobName,
          'test-backend-unit / backend-tests (1)',
          'tests',
          'build',
        ],
        failedJobAnnotations: jobName =>
          Promise.resolve(jobName === webIntegrationJobName ? [runnerLossAnnotation] : []),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })

    it('matches the annotation fallback on the generalized rule second attempt', async () => {
      const ctx = makeCtx({
        runAttempt: 2,
        failedJobNames: [webIntegrationJobName, 'tests', 'build'],
        failedJobAnnotations: jobName =>
          Promise.resolve(jobName === webIntegrationJobName ? [runnerLossAnnotation] : []),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('runner-shutdown-leaf-rerun')
    })
  })

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
