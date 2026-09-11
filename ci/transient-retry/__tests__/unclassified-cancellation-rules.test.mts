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

describe('unclassified timeouts and cancellations', () => {
  for (const runAttempt of [1, 2]) {
    it(`routes an unclassified attempt ${runAttempt} timeout to Harness`, async () => {
      const result = await decide(makeCtx({ conclusion: 'timed_out', runAttempt }), RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })

    it(`routes an attempt ${runAttempt} cancellation without job evidence to Harness`, async () => {
      const result = await decide(makeCtx({ conclusion: 'cancelled', runAttempt }), RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })
  }

  it.each([
    ['Main CI (backend)', 'deploy-api / deploy (api)'],
    ['Main CI (web)', 'deploy / deploy (web)'],
    ['Main CI (backend)', 'migrate / migrate'],
    ['Main CI (web)', 'dispatch / dispatch'],
    ['Main CI (checks)', 'publish / publish-package'],
    ['Main CI (storybook)', 'publish'],
    ['Main CI (lambdas)', 'deploy / deploy (image-resize)'],
  ])('does not ignore cancellation in %s for stateful job %s', async (workflowName, jobName) => {
    const result = await decide(
      makeCtx({
        workflowName,
        conclusion: 'cancelled',
        jobNames: [jobName],
        jobConclusions: new Map([[jobName, 'cancelled']]),
        failedJobNames: [jobName],
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('routes an unclassified failure to Harness', async () => {
    const result = await decide(makeCtx(), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('ignores jobless Main CI lambdas cancellations before deploy jobs are created', async () => {
    const result = await decide(
      makeCtx({
        workflowName: 'Main CI (lambdas)',
        conclusion: 'cancelled',
        jobNames: [],
        failedJobNames: [],
      }),
      RULES,
    )
    expect(result.decision).toBe('ignore')
    expect(result.matchedRule).toBe('workflow-cancelled-without-failure-signal')
  })

  it('ignores Main CI (lambdas) cancellations when only stateless jobs are cancelled', async () => {
    const failedJobNames = ['lambdas-tests']
    const result = await decide(
      makeCtx({
        workflowName: 'Main CI (lambdas)',
        conclusion: 'cancelled',
        jobNames: failedJobNames,
        jobConclusions: new Map(failedJobNames.map(name => [name, 'cancelled'])),
        failedJobNames,
      }),
      RULES,
    )
    expect(result.decision).toBe('ignore')
    expect(result.matchedRule).toBe('workflow-cancelled-without-failure-signal')
  })

  it('reruns a jobless Main CI cloudflare-worker cancellation', async () => {
    const result = await decide(
      makeCtx({
        workflowName: 'Main CI (cloudflare-worker)',
        conclusion: 'cancelled',
        jobNames: [],
        failedJobNames: [],
      }),
      RULES,
    )
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('cloudflare-worker-cancelled-before-job-signal')
  })

  it('ignores repeated jobless Main CI cloudflare-worker cancellations after the rerun rule is exhausted', async () => {
    const result = await decide(
      makeCtx({
        workflowName: 'Main CI (cloudflare-worker)',
        conclusion: 'cancelled',
        runAttempt: 6,
        ruleAttempts: new Map([['cloudflare-worker-cancelled-before-job-signal', 2]]),
        ruleAttempt: 5,
        jobNames: [],
        failedJobNames: [],
      }),
      RULES,
    )
    expect(result.decision).toBe('ignore')
    expect(result.matchedRule).toBe('workflow-cancelled-without-failure-signal')
  })

  it('routes jobless Main CI cloudflare-worker cancellations to Harness without known rerun-rule exhaustion', async () => {
    const result = await decide(
      makeCtx({
        workflowName: 'Main CI (cloudflare-worker)',
        conclusion: 'cancelled',
        runAttempt: 3,
        ruleAttempt: 2,
        jobNames: [],
        failedJobNames: [],
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
