import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { playwrightCredentialedWebServerReservedPortCollisionRule } from './playwright-port-collision-rules.mts'
import { RULES } from './rules.mts'
import type { WorkflowRunContext } from './types.mts'

const ciJobName = 'test-playwright-credentialed / playwright-credentialed-tests'
const mainWebJobName = 'playwright-credentialed-tests / playwright-credentialed-tests'
const jobName = ciJobName
const successfulAllocationAndFailedCredentialedRun = [
  { name: 'Allocate ports', conclusion: 'success' },
  { name: 'Run Playwright credentialed tests', conclusion: 'failure' },
]
function credentialedServerCollisionLog(serverName: string, address = ':::2234'): string {
  const forwardedPrefix = serverName === 'cloudflare-worker' ? '[wrangler] ' : ''
  return [
    '##[group]Run pnpm exec ./ci/with-node-test-options playwright test --config playwright.credentialed.config.mts',
    `[${serverName}] ${forwardedPrefix}Error: listen EADDRINUSE: address already in use ${address}`,
    `[${serverName}] ${forwardedPrefix}  code: 'EADDRINUSE',`,
    'Error: Process from config.webServer was not able to start. Exit code: 1',
    '##[error]Process completed with exit code 1.',
  ].join('\n')
}

const credentialedLambdaCollisionLog = credentialedServerCollisionLog('lambdas')

function makeCtx(overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext {
  const workflowName = overrides.workflowName ?? 'CI'
  const jobName = workflowName === 'Main CI (web)' ? mainWebJobName : ciJobName
  return {
    workflowName,
    conclusion: 'failure',
    runAttempt: 1,
    jobNames: [jobName],
    failedJobNames: [jobName],
    jobConclusions: new Map([[jobName, 'failure']]),
    jobSteps: new Map([[jobName, successfulAllocationAndFailedCredentialedRun]]),
    failedJobLogs: () => Promise.resolve(new Map([[jobName, credentialedLambdaCollisionLog]])),
    jobLogs: () => Promise.resolve(new Map([[jobName, credentialedLambdaCollisionLog]])),
    failedJobAnnotations: () => Promise.resolve([]),
    ...overrides,
  }
}

describe('playwright-credentialed-web-server-reserved-port-collision', () => {
  it.each([
    ['backend', ':::2231'],
    ['lambdas', ':::2232'],
    ['web', '0.0.0.0:2233'],
    ['cloudflare-worker', '127.0.0.1:2234'],
  ])('reruns an exact credentialed pre-spec %s bind collision once', async (server, address) => {
    const log = credentialedServerCollisionLog(server, address)
    const result = await decide(
      makeCtx({ jobLogs: () => Promise.resolve(new Map([[jobName, log]])) }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('playwright-credentialed-web-server-reserved-port-collision')
  })

  it('reruns the same credentialed collision from Main CI web', async () => {
    const result = await decide(makeCtx({ workflowName: 'Main CI (web)' }), RULES)

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('playwright-credentialed-web-server-reserved-port-collision')
  })

  it('rejects an independent reusable Patch Coverage failure', async () => {
    const coverage = 'Patch Coverage / Patch Coverage'
    const result = await decide(
      makeCtx({
        jobNames: [ciJobName, coverage],
        failedJobNames: [ciJobName, coverage],
        jobConclusions: new Map([
          [ciJobName, 'failure'],
          [coverage, 'failure'],
        ]),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
  })

  it('uses the exact credentialed job log instead of the failed-job log collection', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () => Promise.reject(new Error('unrelated failed job log fetch')),
      }),
      [playwrightCredentialedWebServerReservedPortCollisionRule],
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('playwright-credentialed-web-server-reserved-port-collision')
  })

  it('allows the credentialed producer with cancelled sibling fanout and aggregates', async () => {
    const result = await decide(
      makeCtx({
        conclusion: 'cancelled',
        jobNames: [jobName, 'test-web / web-tests (1)', 'Patch Coverage', 'tests', 'build'],
        failedJobNames: [jobName, 'test-web / web-tests (1)', 'Patch Coverage', 'tests', 'build'],
        jobConclusions: new Map([
          [jobName, 'failure'],
          ['test-web / web-tests (1)', 'cancelled'],
          ['Patch Coverage', 'cancelled'],
          ['tests', 'cancelled'],
          ['build', 'cancelled'],
        ]),
      }),
      [playwrightCredentialedWebServerReservedPortCollisionRule],
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('playwright-credentialed-web-server-reserved-port-collision')
  })

  it('rejects Patch Coverage as an independent failure even when all created jobs conclude', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [jobName, 'Patch Coverage', 'tests', 'build'],
        jobNames: [jobName, 'Patch Coverage', 'tests', 'build'],
        jobConclusions: new Map([
          [jobName, 'failure'],
          ['Patch Coverage', 'failure'],
          ['tests', 'failure'],
          ['build', 'failure'],
        ]),
      }),
      [playwrightCredentialedWebServerReservedPortCollisionRule],
    )

    expect(result).toEqual({ decision: 'dispatch', matchedRule: '' })
  })

  it('fails closed for a missing, unknown, or non-cancelled created sibling', async () => {
    const cases: Array<Partial<WorkflowRunContext>> = [
      { jobNames: undefined },
      {
        jobNames: [jobName, 'test-web / web-tests (1)'],
        jobConclusions: new Map([[jobName, 'failure']]),
      },
      {
        jobNames: [jobName, 'test-web / web-tests (1)'],
        jobConclusions: new Map([
          [jobName, 'failure'],
          ['test-web / web-tests (1)', undefined],
        ]),
      },
      {
        jobNames: [jobName, 'unknown producer'],
        failedJobNames: [jobName, 'unknown producer'],
        jobConclusions: new Map([
          [jobName, 'failure'],
          ['unknown producer', 'failure'],
        ]),
      },
    ]

    for (const overrides of cases) {
      const result = await decide(makeCtx(overrides), [
        playwrightCredentialedWebServerReservedPortCollisionRule,
      ])
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    }
  })

  it('rejects another non-cancelled producer leaf', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [jobName, 'test-web / web-tests (1)'],
        jobConclusions: new Map([
          [jobName, 'failure'],
          ['test-web / web-tests (1)', 'failure'],
        ]),
      }),
      [playwrightCredentialedWebServerReservedPortCollisionRule],
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('fails closed without complete failed-job conclusions', async () => {
    for (const jobConclusions of [
      undefined,
      new Map<string, string>(),
      new Map([[jobName, 'cancelled']]),
      new Map([
        [jobName, 'failure'],
        ['test-web / web-tests (1)', 'failure'],
      ]),
    ]) {
      const result = await decide(
        makeCtx({
          failedJobNames: [jobName, 'test-web / web-tests (1)'],
          jobConclusions,
        }),
        [playwrightCredentialedWebServerReservedPortCollisionRule],
      )

      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    }
  })

  it('rejects missing or nonmatching structured steps', async () => {
    for (const jobSteps of [
      undefined,
      new Map([[jobName, [{ name: 'Allocate ports', conclusion: 'failure' }]]]),
      new Map([
        [
          jobName,
          [
            { name: 'Allocate ports', conclusion: 'success' },
            { name: 'Run Playwright credentialed tests', conclusion: 'success' },
          ],
        ],
      ]),
    ]) {
      const result = await decide(makeCtx({ jobSteps }), [
        playwrightCredentialedWebServerReservedPortCollisionRule,
      ])

      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    }
  })

  it('rejects post-spec, assertion, unknown-server, mixed-server, and unrelated-command look-alikes', async () => {
    for (const log of [
      `Running 2 tests using 1 worker\n${credentialedLambdaCollisionLog}`,
      `${credentialedLambdaCollisionLog}\nAssertionError: expected true to be false`,
      credentialedServerCollisionLog('unknown-server'),
      credentialedLambdaCollisionLog.replace('[lambdas]', '[web]'),
      credentialedLambdaCollisionLog.replace(
        'pnpm exec ./ci/with-node-test-options playwright test --config playwright.credentialed.config.mts',
        'pnpm exec unrelated-command',
      ),
    ]) {
      const result = await decide(
        makeCtx({ jobLogs: () => Promise.resolve(new Map([[jobName, log]])) }),
        [playwrightCredentialedWebServerReservedPortCollisionRule],
      )

      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    }
  })
})
