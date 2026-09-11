import { describe, expect, expectTypeOf, it } from 'vitest'

import { decide, formatDecisionOutput } from './decide.mts'
import type { TransientRetryRule, WorkflowRunContext } from './types.mts'

type RerunTransientRetryRule = Extract<TransientRetryRule, { decision?: 'rerun' }>

const makeCtx = (jobId?: number): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  jobIds: jobId === undefined ? undefined : new Map([['storybook / storybook', jobId]]),
  failedJobNames: ['storybook / storybook'],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
})

const targetedRule: RerunTransientRetryRule = {
  id: 'targeted',
  consumerKey: 'targeted',
  rootCauseKey: 'targeted',
  description: 'Target one job',
  rationale: 'Test fixture',
  maxAttempts: 1,
  rerunTarget: { jobName: 'storybook / storybook' },
  match: () => true,
}

const shardFamilyPrefix = 'test-backend-unit / backend-tests ('

function makeFamilyCtx(resolvedJobName: string | null, jobId?: number): WorkflowRunContext {
  return {
    workflowName: 'CI',
    conclusion: 'failure',
    runAttempt: 1,
    jobIds:
      resolvedJobName === null || jobId === undefined
        ? undefined
        : new Map([[resolvedJobName, jobId]]),
    failedJobNames: resolvedJobName === null ? [] : [resolvedJobName],
    failedJobLogs: () => Promise.resolve(new Map()),
    failedJobAnnotations: () => Promise.resolve([]),
  }
}

function familyTargetedRule(resolveJobName: () => string | null): RerunTransientRetryRule {
  return {
    id: 'family-targeted',
    consumerKey: 'family-targeted',
    rootCauseKey: 'family-targeted',
    description: 'Target one job resolved from a dynamically-named family',
    rationale: 'Test fixture',
    maxAttempts: 1,
    rerunTarget: { jobNameFamily: shardFamilyPrefix, resolveJobName },
    match: () => true,
  }
}

describe('targeted rerun decisions', () => {
  it('keeps targeted reruns out of ignore decisions at the type boundary', () => {
    expectTypeOf({
      ...targetedRule,
      decision: 'ignore' as const,
    }).not.toExtend<TransientRetryRule>()
  })
  it('writes a blank or selected rerun job id to GitHub outputs', () => {
    expect(formatDecisionOutput({ decision: 'rerun', matchedRule: 'whole-run' })).toContain(
      'rerun_job_id=\n',
    )
    expect(
      formatDecisionOutput({
        decision: 'rerun',
        matchedRule: 'targeted',
        rerunJobId: 123,
      }),
    ).toContain('rerun_job_id=123\n')
  })

  it('resolves the matching job database id', async () => {
    await expect(decide(makeCtx(123), [targetedRule])).resolves.toEqual({
      decision: 'rerun',
      matchedRule: 'targeted',
      rerunJobId: 123,
    })
  })

  it('fails closed when the job id is unavailable or unsafe', async () => {
    await expect(decide(makeCtx(), [targetedRule])).rejects.toThrow('Cannot target rerun')
    await expect(decide(makeCtx(0), [targetedRule])).rejects.toThrow('Cannot target rerun')
  })

  it('resolves a family-target job database id from the family resolver', async () => {
    const resolvedJobName = `${shardFamilyPrefix}1)`
    const rule = familyTargetedRule(() => resolvedJobName)
    await expect(decide(makeFamilyCtx(resolvedJobName, 456), [rule])).resolves.toEqual({
      decision: 'rerun',
      matchedRule: 'family-targeted',
      rerunJobId: 456,
    })
  })

  it('fails closed when the family resolver returns null instead of falling back to a full-workflow rerun', async () => {
    const rule = familyTargetedRule(() => null)
    await expect(decide(makeFamilyCtx(null), [rule])).rejects.toThrow('Cannot target rerun')
  })

  it('fails closed when the family resolver returns a name outside the declared family', async () => {
    const outsideFamilyName = 'test-web / web-tests (1)'
    const rule = familyTargetedRule(() => outsideFamilyName)
    // Even a valid job id for the wrongly-resolved name must not be used — the family guard
    // rejects before any jobIds lookup happens.
    await expect(decide(makeFamilyCtx(outsideFamilyName, 789), [rule])).rejects.toThrow(
      'Cannot target rerun',
    )
  })
})
