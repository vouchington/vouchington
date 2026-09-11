import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'
import { LOG_OMISSION_MARKER } from './run-context-log-window.mts'

const webIntegrationJobName = 'test-web-integration / web-integration-tests (1)'
const playwrightSelectJobName = 'playwright-tests / select'
const ruleId = 'main-web-build-web-targets-watchdog-timeout'
const staticWatchdogRuleId = 'main-web-static-build-watchdog-timeout'
const staticAcquireTimeoutRuleId = 'main-web-static-build-acquire-timeout',
  staticSilentExitRuleId = 'main-web-static-build-silent-exit'
const staticWebJobName = 'static-checks / static-web'
const cancelledSelectLog = [
  `##[group]Run actions/checkout@${'a'.repeat(40)}`,
  '##[error]The operation was canceled.',
].join('\n')
const watchdogLog = [
  '##[group]Run ./.github/actions/build-web-targets',
  '▲ Next.js 16.3.4 (Turbopack)',
  '  Creating an optimized production build ...',
  'with-host-lock: expensive-build command exceeded 300s; terminating its process group',
  '== host pressure diagnostics ==',
  '== cgroup memory ==',
  'oom_kill 0',
  '== kernel OOM evidence ==',
  'no OOM-kill lines found within bounded reads',
  '[ELIFECYCLE] Command failed with exit code 124.',
  'Error: pnpm --dir web build failed with exit code 124',
  '##[error]Process completed with exit code 1.',
].join('\n')

const staticAcquireTimeoutLog = [
  '##[group]Run pnpm run build',
  '▲ Next.js 16.3.4 (Turbopack)',
  'with-host-lock: expensive-build lock not acquired within 300s',
  '[ELIFECYCLE] Command failed with exit code 1.',
  '##[error]Process completed with exit code 1.',
].join('\n')
const staticSilentExitLog = [
  'Run pnpm run build',
  '▲ Next.js 16.3.4 (Turbopack)',
  '  Creating an optimized production build ...',
  '##[error]Process completed with exit code 1.',
].join('\n')

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Main CI (web)',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [webIntegrationJobName],
  failedJobLogs: () => Promise.resolve(new Map([[webIntegrationJobName, watchdogLog]])),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('main-web-build-web-targets-watchdog-timeout cancelled siblings', () => {
  it('applies the clean cancelled-sibling contract to both watchdog consumers', async () => {
    const cases = [
      {
        failedJobName: webIntegrationJobName,
        log: watchdogLog,
        expectedRuleId: ruleId,
      },
      {
        failedJobName: staticWebJobName,
        log: watchdogLog,
        expectedRuleId: staticWatchdogRuleId,
      },
    ]

    for (const { failedJobName, log, expectedRuleId } of cases) {
      const result = await decide(
        makeCtx({
          failedJobNames: [failedJobName, playwrightSelectJobName],
          jobConclusions: new Map([
            [failedJobName, 'failure'],
            [playwrightSelectJobName, 'cancelled'],
          ]),
          failedJobLogs: () =>
            Promise.resolve(
              new Map([
                [failedJobName, log],
                [playwrightSelectJobName, cancelledSelectLog],
              ]),
            ),
        }),
        RULES,
      )
      expect(`${result.decision}:${result.matchedRule}`).toBe(`rerun:${expectedRuleId}`)
    }
  })

  it('does not broaden static acquire-timeout or silent-exit through a cancelled sibling', async () => {
    for (const [log, protectedRuleId] of [
      [staticAcquireTimeoutLog, staticAcquireTimeoutRuleId],
      [staticSilentExitLog, staticSilentExitRuleId],
    ]) {
      const result = await decide(
        makeCtx({
          failedJobNames: [staticWebJobName, playwrightSelectJobName],
          jobConclusions: new Map([
            [staticWebJobName, 'failure'],
            [playwrightSelectJobName, 'cancelled'],
          ]),
          failedJobLogs: () =>
            Promise.resolve(
              new Map([
                [staticWebJobName, log],
                [playwrightSelectJobName, cancelledSelectLog],
              ]),
            ),
        }),
        RULES,
      )
      expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
      expect(result.matchedRule).not.toBe(protectedRuleId)
    }
  })

  it('reruns web-integration watchdog when playwright-tests / select is cancelled', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [webIntegrationJobName, playwrightSelectJobName],
        jobConclusions: new Map([
          [webIntegrationJobName, 'failure'],
          [playwrightSelectJobName, 'cancelled'],
        ]),
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [webIntegrationJobName, watchdogLog],
              [playwrightSelectJobName, cancelledSelectLog],
            ]),
          ),
      }),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe(`rerun:${ruleId}`)
  })

  it.each([
    [
      'playwright-tests / select failed instead of cancelling',
      {
        jobConclusions: new Map([
          [webIntegrationJobName, 'failure'],
          [playwrightSelectJobName, 'failure'],
        ]),
        selectLog: cancelledSelectLog,
      },
    ],
    [
      'job conclusions are unavailable',
      {
        selectLog: cancelledSelectLog,
      },
    ],
    [
      'the cancelled select log is empty',
      {
        jobConclusions: new Map([
          [webIntegrationJobName, 'failure'],
          [playwrightSelectJobName, 'cancelled'],
        ]),
        selectLog: '',
      },
    ],
    [
      'the cancelled select log could not be fetched',
      {
        jobConclusions: new Map([
          [webIntegrationJobName, 'failure'],
          [playwrightSelectJobName, 'cancelled'],
        ]),
        selectLog: cancelledSelectLog,
        failedJobLogFetchFailures: () => Promise.resolve(new Set([playwrightSelectJobName])),
      },
    ],
    [
      'the cancelled select log has a Playwright assertion',
      {
        jobConclusions: new Map([
          [webIntegrationJobName, 'failure'],
          [playwrightSelectJobName, 'cancelled'],
        ]),
        selectLog: `${cancelledSelectLog}\nError: expect(locator).toBeVisible()`,
      },
    ],
    [
      'the cancelled select log has a compiler diagnostic',
      {
        jobConclusions: new Map([
          [webIntegrationJobName, 'failure'],
          [playwrightSelectJobName, 'cancelled'],
        ]),
        selectLog: `${cancelledSelectLog}\nFailed to compile`,
      },
    ],
    [
      'the cancelled select log has kernel OOM evidence',
      {
        jobConclusions: new Map([
          [webIntegrationJobName, 'failure'],
          [playwrightSelectJobName, 'cancelled'],
        ]),
        selectLog: `${cancelledSelectLog}\nOut of memory: Killed process 1491514 (next-build (v16)`,
      },
    ],
    [
      'the cancelled select log omitted its middle',
      {
        jobConclusions: new Map([
          [webIntegrationJobName, 'failure'],
          [playwrightSelectJobName, 'cancelled'],
        ]),
        selectLog: `${cancelledSelectLog}${LOG_OMISSION_MARKER}`,
      },
    ],
    [
      'the cancelled select log has an unrecognized Actions error',
      {
        jobConclusions: new Map([
          [webIntegrationJobName, 'failure'],
          [playwrightSelectJobName, 'cancelled'],
        ]),
        selectLog: `${cancelledSelectLog}\n##[error]shard-total must be an integer from 1 through 256, got: 'x'`,
      },
    ],
  ])('does not rerun when %s', async (_name, overrides) => {
    const { selectLog, ...ctxOverrides } = overrides
    const result = await decide(
      makeCtx({
        failedJobNames: [webIntegrationJobName, playwrightSelectJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [webIntegrationJobName, watchdogLog],
              [playwrightSelectJobName, selectLog],
            ]),
          ),
        ...ctxOverrides,
      }),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
  })
})
