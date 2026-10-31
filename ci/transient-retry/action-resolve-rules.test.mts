import { describe, expect, it } from 'vitest'

import { makeCtx } from '../test-helpers/transient-retry/helpers.mts'
import { evaluateWorkflow as decide } from './decide.mts'
import { rules, type WorkflowRunContext } from './rules.mts'

const leaf = 'test-web-api / web-api-tests (1)'
const checkoutRef = `actions/checkout@${'a'.repeat(40)}`
const toolingRef = `vouchington/vouchington-tooling@${'b'.repeat(40)}`
const unresolved = (ref: string, version = ref.split('@')[1]) =>
  `Unable to resolve action \`${ref}\`, unable to find version \`${version}\``

const toLog = (lines: string[], step = 'Set up job') =>
  lines.map(line => `${leaf}\t${step}\t2026-10-30T12:46:56.8294304Z ${line}`).join('\n')

// Trimmed from run 41057506796 / job 124070067652; the error line keeps the observed shape.
const observedLog = toLog([
  'Prepare all required actions',
  'Getting action download info',
  `##[error]${unresolved(checkoutRef)}. ${unresolved(toolingRef)}`,
])

const setupFailed = [{ name: 'Set up job', conclusion: 'failure' }]

function context(log = observedLog, overrides: Partial<WorkflowRunContext> = {}) {
  return makeCtx({
    failedJobNames: [leaf, 'web'],
    jobSteps: new Map([[leaf, setupFailed]]),
    failedJobLogs: () => Promise.resolve(new Map([[leaf, log]])),
    ...overrides,
  })
}

async function matchedRule(ctx: WorkflowRunContext) {
  return (await decide(ctx, rules)).matchedRule
}

describe('GitHub Actions action-resolve setup failure', () => {
  it('reruns the observed failure once, in any workflow', async () => {
    const result = await decide(context(), rules)
    expect(result).toEqual({ decision: 'rerun', matchedRule: 'action-resolve-setup-retry' })
    expect(
      await matchedRule(context(observedLog, { workflowName: 'Static', failedJobNames: [leaf] })),
    ).toBe('action-resolve-setup-retry')
  })

  it('matches a single-action error without a trailing period', async () => {
    const log = toLog([`##[error]${unresolved(checkoutRef)}`])
    expect(await matchedRule(context(log))).toBe('action-resolve-setup-retry')
  })

  it('stops after the first rerun', async () => {
    const result = await decide(context(observedLog, { runAttempt: 2 }), rules)
    expect(result.matchedRule).toBe('')
  })

  it.each([
    ['a started repository step', toLog([`##[error]${unresolved(checkoutRef)}`, '##[group]Run x'])],
    ['another setup error', toLog(['##[error]The operation was canceled.'])],
    [
      'a mixed error',
      toLog([
        `##[error]${unresolved(checkoutRef)}`,
        '##[error]Process completed with exit code 1.',
      ]),
    ],
    ['a tag ref', toLog([`##[error]${unresolved('actions/checkout@main')}`])],
    ['a version that differs from the SHA', toLog([`##[error]${unresolved(checkoutRef, 'main')}`])],
    ['a missing error line', toLog(['Getting action download info'])],
  ])('does not match %s', async (_name, log) => {
    expect(await matchedRule(context(log))).toBe('')
  })

  it('does not match a failed step after setup or a test failure', async () => {
    const steps = new Map([
      [
        leaf,
        [
          { name: 'Set up job', conclusion: 'success' },
          { name: 'Run tests', conclusion: 'failure' },
        ],
      ],
    ])
    expect(await matchedRule(context(observedLog, { jobSteps: steps }))).toBe('')
  })

  it('does not match when setup is not the only failed step', async () => {
    const steps = new Map([
      [leaf, [...setupFailed, { name: 'Post Run actions/checkout', conclusion: 'failure' }]],
    ])
    expect(await matchedRule(context(observedLog, { jobSteps: steps }))).toBe('')
  })

  it('does not match when another leaf fails differently', async () => {
    const other = 'test-web-api / other'
    const ctx = context(observedLog, {
      failedJobNames: [leaf, other],
      jobSteps: new Map([
        [leaf, setupFailed],
        [other, [{ name: 'Run tests', conclusion: 'failure' }]],
      ]),
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [leaf, observedLog],
            [other, '##[error]Process completed'],
          ]),
        ),
    })
    expect(await matchedRule(ctx)).toBe('')
  })

  it('does not match when only an area gate failed', async () => {
    expect(await matchedRule(context(observedLog, { failedJobNames: ['web'] }))).toBe('')
  })

  it('does not match when a log could not be fetched', async () => {
    const ctx = context(observedLog, {
      failedJobLogFetchFailures: () => Promise.resolve(new Set([leaf])),
    })
    expect(await matchedRule(ctx)).toBe('')
  })

  it('does not match a cancelled workflow', async () => {
    expect(await matchedRule(context(observedLog, { conclusion: 'cancelled' }))).not.toBe(
      'action-resolve-setup-retry',
    )
  })
})
