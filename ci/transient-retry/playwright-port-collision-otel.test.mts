import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const shardJobName = 'playwright-tests / playwright-tests (1)'
const failedOtelSteps = [{ name: 'Start OTel collector', conclusion: 'failure' }]
const succeededOtelSteps = [{ name: 'Start OTel collector', conclusion: 'success' }]
const failedAllocatePortsSteps = [{ name: 'Allocate ports', conclusion: 'failure' }]
const succeededAllocatePortsSteps = [{ name: 'Allocate ports', conclusion: 'success' }]
const collectorPortCollisionLog = [
  '##[group]Start OTel collector',
  'Starting OTel collector',
  'docker: Error response from daemon: Bind for 127.0.0.1:2204 failed: port is already allocated.',
  '##[error]Process completed with exit code 125.',
].join('\n')
const unrelatedDockerPortCollisionLog = [
  '##[group]Start OTel collector',
  'Starting OTel collector',
  'OTel collector started',
  '##[group]Create unrelated container',
  'docker: Error response from daemon: Bind for 127.0.0.1:2204 failed: address already in use.',
  '##[error]Process completed with exit code 125.',
].join('\n')
const allocationPortCollisionLog = [
  '##[group]Run python3 ci/allocate-browser-safe-ports.py 6',
  '::error::Port 2204 is already in use after allocation; deterministic allocation will not retry',
  '##[error]Process completed with exit code 1.',
].join('\n')
const holdAllocationFailureLog = [
  '##[group]Run python3 ci/allocate-browser-safe-ports.py 6 --hold',
  '::error::failed to allocate 5 ports after 16 bind attempts from runner slice 2',
  '##[error]Process completed with exit code 1.',
].join('\n')

function makeCtx(overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext {
  return {
    workflowName: 'Main CI (web)',
    conclusion: 'failure',
    runAttempt: 1,
    failedJobNames: [shardJobName],
    failedJobLogs: () => Promise.resolve(new Map([[shardJobName, collectorPortCollisionLog]])),
    failedJobAnnotations: () => Promise.resolve([]),
    ...overrides,
  }
}

describe('main-web-playwright-reserved-port-collision OTel', () => {
  it('reruns when the exact Allocate ports step reports the deterministic late-bind diagnostic', async () => {
    const result = await decide(
      makeCtx({
        jobSteps: new Map([[shardJobName, failedAllocatePortsSteps]]),
        failedJobLogs: () => Promise.resolve(new Map([[shardJobName, allocationPortCollisionLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-playwright-reserved-port-collision')
  })

  it('reruns when hold-mode allocate cannot reserve the runner slice', async () => {
    const result = await decide(
      makeCtx({
        jobSteps: new Map([[shardJobName, failedAllocatePortsSteps]]),
        failedJobLogs: () => Promise.resolve(new Map([[shardJobName, holdAllocationFailureLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-playwright-reserved-port-collision')
  })

  it('fails closed for missing, successful, or different allocation-step data', async () => {
    for (const jobSteps of [
      undefined,
      new Map([[shardJobName, succeededAllocatePortsSteps]]),
      new Map([[shardJobName, [{ name: 'Allocate port', conclusion: 'failure' }]]]),
    ]) {
      const result = await decide(
        makeCtx({
          jobSteps,
          failedJobLogs: () =>
            Promise.resolve(new Map([[shardJobName, allocationPortCollisionLog]])),
        }),
        RULES,
      )

      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    }
  })

  it('reruns when the exact collector step failed with either Docker bind signature', async () => {
    for (const log of [
      collectorPortCollisionLog,
      collectorPortCollisionLog.replace('port is already allocated', 'address already in use'),
    ]) {
      const result = await decide(
        makeCtx({
          jobSteps: new Map([[shardJobName, failedOtelSteps]]),
          failedJobLogs: () => Promise.resolve(new Map([[shardJobName, log]])),
        }),
        RULES,
      )

      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('main-web-playwright-reserved-port-collision')
    }
  })

  it('fails closed without failed collector-step data', async () => {
    for (const jobSteps of [undefined, new Map([[shardJobName, succeededOtelSteps]])]) {
      const result = await decide(makeCtx({ jobSteps }), RULES)

      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    }
  })

  it('rejects a later unrelated Docker bind error after a successful OTel step', async () => {
    const result = await decide(
      makeCtx({
        jobSteps: new Map([[shardJobName, succeededOtelSteps]]),
        failedJobLogs: () =>
          Promise.resolve(new Map([[shardJobName, unrelatedDockerPortCollisionLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
