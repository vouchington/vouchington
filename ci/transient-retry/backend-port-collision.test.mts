import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const backendSmokeJobName = 'backend-smoke / smoke'
const otherBackendUnitShardJobName = 'test-backend-unit / backend-tests (2)'
const ciDownstreamFanInJobNames = ['tests', 'build']

const allocationCollisionLog = [
  '::error::Port 2216 is already in use after allocation; deterministic allocation will not retry',
  '##[error]Process completed with exit code 1.',
].join('\n')
const smokeServerCollisionLog = [
  '##[group]Run ./scripts/tests/smoke-test-server.sh && ./scripts/tests/smoke-test-worker.sh',
  '✗ Error: Server failed during initialization. Output:',
  'Error: listen EADDRINUSE: address already in use :::2216',
  '    at Server.setupListenHandle [as _listen2] (node:net:1908:16)',
  '    at listenInCluster (node:net:1965:12)',
  '    at Server.listen (node:net:2067:7) {',
  "  code: 'EADDRINUSE',",
  '##[error]Process completed with exit code 1.',
].join('\n')
const earlyExitSmokeServerCollisionLog = smokeServerCollisionLog.replace(
  'Server failed during initialization',
  'Server process died unexpectedly',
)
const successfulAllocationAndFailedSmokeSteps = [
  { name: 'Allocate backend port', conclusion: 'success' },
  { name: 'Smoke test backend', conclusion: 'failure' },
]

function makeCtx(overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext {
  return {
    workflowName: 'CI',
    conclusion: 'failure',
    runAttempt: 1,
    jobNames: [backendSmokeJobName],
    jobConclusions: new Map([[backendSmokeJobName, 'failure']]),
    jobSteps: new Map([
      [backendSmokeJobName, [{ name: 'Allocate backend port', conclusion: 'failure' }]],
    ]),
    failedJobNames: [backendSmokeJobName],
    failedJobLogs: () => Promise.resolve(new Map([[backendSmokeJobName, allocationCollisionLog]])),
    jobLogs: () => Promise.resolve(new Map([[backendSmokeJobName, allocationCollisionLog]])),
    failedJobAnnotations: () => Promise.resolve([]),
    ...overrides,
  }
}

describe('backend-smoke-reserved-port-collision', () => {
  it('reruns CI when allocation reports the exact late-bind collision', async () => {
    let requestedJobNames: string[] | undefined
    const result = await decide(
      makeCtx({
        jobLogs: jobNames => {
          requestedJobNames = jobNames
          return Promise.resolve(new Map([[backendSmokeJobName, allocationCollisionLog]]))
        },
      }),
      RULES,
    )

    expect(result).toEqual({
      decision: 'rerun',
      matchedRule: 'backend-smoke-reserved-port-collision',
    })
    expect(requestedJobNames).toEqual([backendSmokeJobName])
  })

  it('reruns the exact smoke-server late bind after successful allocation', async () => {
    const result = await decide(
      makeCtx({
        jobSteps: new Map([[backendSmokeJobName, successfulAllocationAndFailedSmokeSteps]]),
        jobLogs: () => Promise.resolve(new Map([[backendSmokeJobName, smokeServerCollisionLog]])),
      }),
      RULES,
    )

    expect(result).toEqual({
      decision: 'rerun',
      matchedRule: 'backend-smoke-reserved-port-collision',
    })
  })

  it('reruns the same collision when the smoke wrapper observes the server exit first', async () => {
    const result = await decide(
      makeCtx({
        jobSteps: new Map([[backendSmokeJobName, successfulAllocationAndFailedSmokeSteps]]),
        jobLogs: () =>
          Promise.resolve(new Map([[backendSmokeJobName, earlyExitSmokeServerCollisionLog]])),
      }),
      RULES,
    )

    expect(result).toEqual({
      decision: 'rerun',
      matchedRule: 'backend-smoke-reserved-port-collision',
    })
  })

  it('fails closed for smoke-server collision look-alikes and mixed failure signals', async () => {
    for (const log of [
      smokeServerCollisionLog.replace('smoke-test-server', 'unrelated'),
      smokeServerCollisionLog.replace("code: 'EADDRINUSE'", "code: 'ECONNREFUSED'"),
      smokeServerCollisionLog.replace(
        "  code: 'EADDRINUSE',",
        `${Array.from({ length: 13 }, (_, index) => `    at excessiveFrame${index}`).join('\n')}\n  code: 'EADDRINUSE',`,
      ),
      `${smokeServerCollisionLog}\nAssertionError: expected 200 to be 201`,
      `${smokeServerCollisionLog}\nTest Files  1 failed | 20 passed (21)`,
      `${smokeServerCollisionLog}\n✗ Error: /infra/ping returned HTTP 500, expected 200`,
    ]) {
      const result = await decide(
        makeCtx({
          jobSteps: new Map([[backendSmokeJobName, successfulAllocationAndFailedSmokeSteps]]),
          jobLogs: () => Promise.resolve(new Map([[backendSmokeJobName, log]])),
        }),
        RULES,
      )
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    }
  })

  it('allows CI aggregate failures and cancelled downstream fan-out after smoke fails', async () => {
    const cancelledFanout = 'test-web / web-tests (1)'
    const result = await decide(
      makeCtx({
        conclusion: 'cancelled',
        jobNames: [backendSmokeJobName, ...ciDownstreamFanInJobNames, cancelledFanout],
        jobConclusions: new Map([
          [backendSmokeJobName, 'failure'],
          ...ciDownstreamFanInJobNames.map(name => [name, 'failure'] as const),
          [cancelledFanout, 'cancelled'],
        ]),
        failedJobNames: [backendSmokeJobName, ...ciDownstreamFanInJobNames, cancelledFanout],
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-smoke-reserved-port-collision')
  })

  it('reruns Main CI backend only when smoke is the sole failed job', async () => {
    const result = await decide(
      makeCtx({
        workflowName: 'Main CI (backend)',
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-smoke-reserved-port-collision')
  })

  it('fails closed after the one-attempt cap', async () => {
    const result = await decide(makeCtx({ runAttempt: 2 }), RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('fails closed for another real CI failure or any additional Main CI failure', async () => {
    const cases: Array<Partial<WorkflowRunContext>> = [
      {
        jobNames: [otherBackendUnitShardJobName],
        jobConclusions: new Map([[otherBackendUnitShardJobName, 'failure']]),
        jobSteps: new Map([
          [
            otherBackendUnitShardJobName,
            [{ name: 'Allocate backend port', conclusion: 'failure' }],
          ],
        ]),
        failedJobNames: [otherBackendUnitShardJobName],
        jobLogs: () =>
          Promise.resolve(new Map([[otherBackendUnitShardJobName, allocationCollisionLog]])),
      },
      {
        jobNames: [backendSmokeJobName, otherBackendUnitShardJobName],
        jobConclusions: new Map([
          [backendSmokeJobName, 'failure'],
          [otherBackendUnitShardJobName, 'failure'],
        ]),
        failedJobNames: [backendSmokeJobName, otherBackendUnitShardJobName],
      },
      {
        jobNames: [backendSmokeJobName, 'Patch Coverage'],
        jobConclusions: new Map([
          [backendSmokeJobName, 'failure'],
          ['Patch Coverage', 'failure'],
        ]),
        failedJobNames: [backendSmokeJobName, 'Patch Coverage'],
      },
      {
        workflowName: 'Main CI (backend)',
        jobNames: [backendSmokeJobName, 'build / build'],
        jobConclusions: new Map([
          [backendSmokeJobName, 'failure'],
          ['build / build', 'cancelled'],
        ]),
        failedJobNames: [backendSmokeJobName, 'build / build'],
      },
    ]

    for (const overrides of cases) {
      const result = await decide(makeCtx(overrides), RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    }
  })

  it('accepts standard timestamp-prefixed GitHub log lines', async () => {
    const timestampedLog = allocationCollisionLog
      .split('\n')
      .map(line => `2026-07-29T10:12:13.456Z ${line}`)
      .join('\n')
    const result = await decide(
      makeCtx({
        jobLogs: () => Promise.resolve(new Map([[backendSmokeJobName, timestampedLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-smoke-reserved-port-collision')
  })

  it('fails closed when job metadata, the failed allocation step, or the exact log is unavailable', async () => {
    const cases: Array<Partial<WorkflowRunContext>> = [
      { jobConclusions: undefined },
      { jobNames: undefined },
      { jobConclusions: new Map() },
      { jobSteps: undefined },
      {
        jobSteps: new Map([
          [backendSmokeJobName, [{ name: 'Allocate backend port', conclusion: 'success' }]],
        ]),
      },
      {
        jobSteps: new Map([
          [backendSmokeJobName, [{ name: 'Allocate ports', conclusion: 'failure' }]],
        ]),
      },
      { jobLogs: undefined },
      { jobLogs: () => Promise.resolve(new Map()) },
      {
        failedJobLogFetchFailures: () => Promise.resolve(new Set([backendSmokeJobName])),
      },
    ]

    for (const overrides of cases) {
      const result = await decide(makeCtx(overrides), RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    }
  })

  it('fails closed for an altered diagnostic, non-terminal exit, or test failure signal', async () => {
    const cases = [
      allocationCollisionLog.replace('deterministic allocation will not retry', 'retrying'),
      allocationCollisionLog.replace('exit code 1.', 'exit code 125.'),
      `${allocationCollisionLog}\nAssertionError: expected 200 to be 201`,
      `${allocationCollisionLog}\nTest Files  1 failed | 20 passed (21)`,
      `${allocationCollisionLog}\n✗ Error: smoke server exited unexpectedly`,
    ]

    for (const log of cases) {
      const result = await decide(
        makeCtx({
          jobLogs: () => Promise.resolve(new Map([[backendSmokeJobName, log]])),
        }),
        RULES,
      )
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    }
  })
})
