import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const playwrightShardJobName = 'playwright-tests / playwright-tests (4)'
const webIntegrationJobName = 'test-web-integration / web-integration-tests (1)'
const staticWebJobName = 'static-checks / static-web'
const buildWebTargetsRuleId = 'main-web-build-web-targets-acquire-timeout'
const staticBuildRuleId = 'main-web-static-build-acquire-timeout'
const buildWebTargetsWatchdogRuleId = 'main-web-build-web-targets-watchdog-timeout'
const staticBuildWatchdogRuleId = 'main-web-static-build-watchdog-timeout'

// Derived from source, not a captured CI run (#10994's fingerprint has no observed run yet). The
// `with-host-lock:` acquire line and its exit-1 termination were live-repro'd via
// ci/with-build-lock.test.mts's "fails closed on CI when the caller opts into strict acquisition"
// case; the surrounding job literals come from build-web-targets/action.yml (`Run
// ./.github/actions/build-web-targets`) and ci/setup-web-integration.mts:162's
// `${command} ${args.join(' ')} failed with exit code ${code}` template.
const buildWebTargetsAcquireTimeoutLog = [
  '##[group]Run ./.github/actions/build-web-targets',
  '▲ Next.js 16.3.4 (Turbopack)',
  'with-host-lock: expensive-build lock not acquired within 300s',
  '== host pressure diagnostics ==',
  '== cgroup memory ==',
  'oom_kill 0',
  '== kernel OOM evidence ==',
  'no OOM-kill lines found within bounded reads',
  'Error: pnpm --dir web build failed with exit code 1',
  '##[error]Process completed with exit code 1.',
].join('\n')

// Trimmed from Main CI (web) run 33947220513 (same fixture as web-build-watchdog-rules.test.mts) —
// proves the watchdog/command-timeout fingerprint still routes to its own rule, not this one.
const buildWebTargetsWatchdogLog = [
  '##[group]Run ./.github/actions/build-web-targets',
  '▲ Next.js 16.3.4 (Turbopack)',
  '  Creating an optimized production build ...',
  'with-host-lock: expensive-build command exceeded 300s; terminating its process group',
  '[ELIFECYCLE] Command failed with exit code 124.',
  'Error: pnpm --dir web build failed with exit code 124',
  '##[error]Process completed with exit code 1.',
].join('\n')

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Main CI (web)',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [playwrightShardJobName],
  failedJobLogs: () =>
    Promise.resolve(new Map([[playwrightShardJobName, buildWebTargetsAcquireTimeoutLog]])),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('main-web-build-web-targets-acquire-timeout', () => {
  it('reruns the Playwright shard acquire timeout', async () => {
    const result = await decide(makeCtx(), RULES)
    expect(`${result.decision}:${result.matchedRule}`).toBe(`rerun:${buildWebTargetsRuleId}`)
  })

  it('reruns the same fingerprint on web-integration build-web-targets', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [webIntegrationJobName],
        failedJobLogs: () =>
          Promise.resolve(new Map([[webIntegrationJobName, buildWebTargetsAcquireTimeoutLog]])),
      }),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe(`rerun:${buildWebTargetsRuleId}`)
  })

  it('does not rerun the benign run-unlocked variant', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                playwrightShardJobName,
                buildWebTargetsAcquireTimeoutLog.replace(
                  'with-host-lock: expensive-build lock not acquired within 300s',
                  'with-host-lock: expensive-build lock not acquired within 300s; running unlocked',
                ),
              ],
            ]),
          ),
      }),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
  })

  it('does not rerun an echoed source line rather than emitted output', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                playwrightShardJobName,
                buildWebTargetsAcquireTimeoutLog.replace(
                  'with-host-lock: expensive-build lock not acquired within 300s',
                  'echo "with-host-lock: expensive-build lock not acquired within 300s"',
                ),
              ],
            ]),
          ),
      }),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
  })

  it('routes the watchdog/command-timeout fingerprint to its own rule, not this one', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(new Map([[playwrightShardJobName, buildWebTargetsWatchdogLog]])),
      }),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe(
      `rerun:${buildWebTargetsWatchdogRuleId}`,
    )
  })

  it.each([
    [
      'a Next compiler failure',
      `${buildWebTargetsAcquireTimeoutLog}\nFailed to compile\nModule not found: Can't resolve '@/missing'`,
    ],
    [
      'kernel OOM evidence',
      buildWebTargetsAcquireTimeoutLog
        .replace('oom_kill 0', 'oom_kill 1')
        .replace(
          'no OOM-kill lines found within bounded reads',
          'Out of memory: Killed process 1491514 (next-build (v16)',
        ),
    ],
    [
      'a bare build-web-targets command without a GitHub Actions group header',
      buildWebTargetsAcquireTimeoutLog.replace(
        '##[group]Run ./.github/actions/build-web-targets',
        'Run ./.github/actions/build-web-targets',
      ),
    ],
    [
      'missing build-web-targets start evidence',
      buildWebTargetsAcquireTimeoutLog.replace(
        '##[group]Run ./.github/actions/build-web-targets',
        '##[group]Run Playwright tests',
      ),
    ],
  ])('does not rerun when the log has %s', async (_name, log) => {
    const result = await decide(
      makeCtx({ failedJobLogs: () => Promise.resolve(new Map([[playwrightShardJobName, log]])) }),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
  })

  it('does not rerun after the retry cap is exhausted', async () => {
    const result = await decide(makeCtx({ runAttempt: 2 }), RULES)
    expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
  })
})

describe('main-web-static-build-acquire-timeout', () => {
  // static-web now builds through the same build-web-targets composite as the Playwright/web-
  // integration consumers, so its acquire-timeout fingerprint is the identical
  // hasBuildWebTargetsAcquireTimeout check exercised above under
  // `main-web-build-web-targets-acquire-timeout` — reuse buildWebTargetsAcquireTimeoutLog rather
  // than maintain a near-duplicate fixture, and cover only what is specific to this rule's own
  // leaf-set restriction.
  const staticCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext =>
    makeCtx({
      failedJobNames: [staticWebJobName],
      failedJobLogs: () =>
        Promise.resolve(new Map([[staticWebJobName, buildWebTargetsAcquireTimeoutLog]])),
      ...overrides,
    })

  it('reruns the static-web job when it hits the shared build-web-targets acquire fingerprint', async () => {
    const result = await decide(staticCtx(), RULES)
    expect(`${result.decision}:${result.matchedRule}`).toBe(`rerun:${staticBuildRuleId}`)
  })

  it('does not rerun the benign run-unlocked variant', async () => {
    const result = await decide(
      staticCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                staticWebJobName,
                buildWebTargetsAcquireTimeoutLog.replace(
                  'with-host-lock: expensive-build lock not acquired within 300s',
                  'with-host-lock: expensive-build lock not acquired within 300s; running unlocked',
                ),
              ],
            ]),
          ),
      }),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
  })

  it('routes the watchdog/command-timeout fingerprint to its own rule, not this one', async () => {
    const result = await decide(
      staticCtx({
        failedJobLogs: () =>
          Promise.resolve(new Map([[staticWebJobName, buildWebTargetsWatchdogLog]])),
      }),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe(`rerun:${staticBuildWatchdogRuleId}`)
  })

  it('does not rerun when the shared build-web-targets start marker is missing', async () => {
    const result = await decide(
      staticCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                staticWebJobName,
                buildWebTargetsAcquireTimeoutLog.replace(
                  '##[group]Run ./.github/actions/build-web-targets',
                  '##[group]Run Playwright tests',
                ),
              ],
            ]),
          ),
      }),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
  })

  it('does not rerun after the retry cap is exhausted', async () => {
    const result = await decide(staticCtx({ runAttempt: 2 }), RULES)
    expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
  })
})
