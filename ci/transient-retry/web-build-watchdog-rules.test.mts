import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const playwrightShardFourJobName = 'playwright-tests / playwright-tests (4)'
const playwrightShardOneJobName = 'playwright-tests / playwright-tests (1)'
const webIntegrationJobName = 'test-web-integration / web-integration-tests (1)'
const webTestsJobName = 'test-web / web-tests (1)'
const storePlaywrightOtelJobName = 'store-playwright-otel'
const ruleId = 'main-web-build-web-targets-watchdog-timeout'
const staticWebRuleId = 'main-web-static-build-watchdog-timeout'

// Trimmed from Main CI (web) run 33947220513, `playwright-tests / playwright-tests (4)`.
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

const compilerLookalikeLog = `${watchdogLog}\nFailed to compile\nModule not found: Can't resolve '@/missing'`
const oomLookalikeLog = watchdogLog
  .replace('oom_kill 0', 'oom_kill 1')
  .replace(
    'no OOM-kill lines found within bounded reads',
    'Out of memory: Killed process 1491514 (next-build (v16)',
  )
const missingStartLog = watchdogLog.replace(
  '##[group]Run ./.github/actions/build-web-targets',
  '##[group]Run Playwright tests',
)
const missingWatchdogLog = watchdogLog.replace(
  'with-host-lock: expensive-build command exceeded 300s; terminating its process group',
  'next build still running',
)

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Main CI (web)',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [playwrightShardFourJobName],
  failedJobLogs: () => Promise.resolve(new Map([[playwrightShardFourJobName, watchdogLog]])),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('main-web-build-web-targets-watchdog-timeout', () => {
  it('reruns the Playwright shard watchdog timeout from run 33947220513', async () => {
    const result = await decide(makeCtx(), RULES)
    expect(`${result.decision}:${result.matchedRule}`).toBe(`rerun:${ruleId}`)
  })

  it('reruns when both failed Playwright shards share the watchdog fingerprint', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [playwrightShardOneJobName, playwrightShardFourJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [playwrightShardOneJobName, watchdogLog],
              [playwrightShardFourJobName, watchdogLog],
            ]),
          ),
      }),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe(`rerun:${ruleId}`)
  })

  it('reruns the same fingerprint on web-integration build-web-targets', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [webIntegrationJobName],
        failedJobLogs: () => Promise.resolve(new Map([[webIntegrationJobName, watchdogLog]])),
      }),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe(`rerun:${ruleId}`)
  })

  it('reruns when store-playwright-otel is downstream of a failed shard', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [playwrightShardFourJobName, storePlaywrightOtelJobName],
        jobConclusions: new Map([
          [playwrightShardFourJobName, 'failure'],
          [storePlaywrightOtelJobName, 'skipped'],
        ]),
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [playwrightShardFourJobName, watchdogLog],
              [storePlaywrightOtelJobName, '##[error]No Playwright OTel artifacts found'],
            ]),
          ),
      }),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe(`rerun:${ruleId}`)
  })

  it.each([
    ['Next compiler failure', compilerLookalikeLog],
    ['kernel OOM during next-build', oomLookalikeLog],
    [
      'a bare build-web-targets command without a GitHub Actions group header',
      watchdogLog.replace(
        '##[group]Run ./.github/actions/build-web-targets',
        'Run ./.github/actions/build-web-targets',
      ),
    ],
    ['missing build-web-targets start marker', missingStartLog],
    ['missing expensive-build watchdog marker', missingWatchdogLog],
  ])('does not rerun when %s', async (_name, log) => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () => Promise.resolve(new Map([[playwrightShardFourJobName, log]])),
      }),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
  })

  it('does not rerun when an unrelated web-tests shard also fails', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [playwrightShardFourJobName, webTestsJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [playwrightShardFourJobName, watchdogLog],
              [webTestsJobName, 'Test Files  1 failed | 40 passed'],
            ]),
          ),
      }),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
  })

  it('does not rerun after the retry cap is exhausted', async () => {
    const result = await decide(makeCtx({ runAttempt: 2 }), RULES)
    expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
  })
})

describe('main-web-static-build-watchdog-timeout', () => {
  // static-web now builds through the same build-web-targets composite as the Playwright/web-
  // integration consumers, so its watchdog fingerprint is the identical hasBuildWebTargetsWatchdogTimeout
  // check exercised above under `main-web-build-web-targets-watchdog-timeout` — reuse watchdogLog rather
  // than maintain a near-duplicate fixture, and cover only what is specific to this rule's own leaf-set
  // restriction (one negative case proves the shared fingerprint is actually wired in, not hardcoded).
  it('reruns the static-web job when it hits the shared build-web-targets watchdog fingerprint', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: ['static-checks / static-web'],
        failedJobLogs: () =>
          Promise.resolve(new Map([['static-checks / static-web', watchdogLog]])),
      }),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe(`rerun:${staticWebRuleId}`)
  })

  it('does not rerun when the shared build-web-targets start marker is missing', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: ['static-checks / static-web'],
        failedJobLogs: () =>
          Promise.resolve(new Map([['static-checks / static-web', missingStartLog]])),
      }),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
  })

  it('does not rerun with an unrelated failed leaf job', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: ['static-checks / static-web', webTestsJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              ['static-checks / static-web', watchdogLog],
              [webTestsJobName, 'Test Files  1 failed | 40 passed'],
            ]),
          ),
      }),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
  })

  it('does not rerun after the retry cap is exhausted', async () => {
    const result = await decide(
      makeCtx({
        runAttempt: 2,
        failedJobNames: ['static-checks / static-web'],
        failedJobLogs: () =>
          Promise.resolve(new Map([['static-checks / static-web', watchdogLog]])),
      }),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
  })
})
