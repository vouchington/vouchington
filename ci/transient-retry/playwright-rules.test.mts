import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'
import { runnerShutdownLeafRerunMatch } from './runner-shutdown-consumers.mts'

const playwrightShardOneJobName = 'test-playwright / playwright-tests (1)'
const playwrightShardTwoJobName = 'test-playwright / playwright-tests (2)'
const mainWebPlaywrightShardOneJobName = 'playwright-tests / playwright-tests (1)'
const credentialedPlaywrightJobName = 'test-playwright-credentialed / playwright-credentialed-tests'
const mainWebCredentialedPlaywrightJobName =
  'playwright-credentialed-tests / playwright-credentialed-tests'
const storybookJobName = 'storybook / storybook'
const mainStorybookJobName = 'storybook-build / storybook'
const matchingLog = [
  'test-playwright / playwright-tests (1)\tUNKNOWN STEP\t2026-06-18T11:17:11.1334420Z $ cross-env NODE_ENV=production next build',
  'test-playwright / playwright-tests (1)\tUNKNOWN STEP\t2026-06-18T11:17:34.0919537Z ##[error]The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.',
  'test-playwright / playwright-tests (1)\tUNKNOWN STEP\t2026-06-18T11:17:34.1213952Z ELIFECYCLE Command failed.',
  'test-playwright / playwright-tests (1)\tUNKNOWN STEP\t2026-06-18T11:17:34.5258803Z ##[error]The operation was canceled.',
].join('\n')
const assertionFailureLog = matchingLog
  .replace(
    '##[error]The runner has received a shutdown signal.',
    'Error: expected true to be false',
  )
  .replace('##[error]The operation was canceled.', '##[error]Process completed with exit code 1.')
const aptLockLog = [
  'playwright-tests / playwright-tests (1)\tUNKNOWN STEP\t2026-06-19T04:20:44.7031854Z ##[group]Run ./.github/actions/setup-playwright',
  'playwright-tests / playwright-tests (1)\tUNKNOWN STEP\t2026-06-19T04:20:44.8031854Z echo "$$" > "$lock_dir/owner.pid"',
  'playwright-tests / playwright-tests (1)\tUNKNOWN STEP\t2026-06-19T04:20:45.3928465Z Switching to root user to install dependencies...',
  'playwright-tests / playwright-tests (1)\tUNKNOWN STEP\t2026-06-19T04:20:45.9351067Z E: Could not get lock /var/lib/apt/lists/lock. It is held by process 3788239 (apt)',
  'playwright-tests / playwright-tests (1)\tUNKNOWN STEP\t2026-06-19T04:20:45.9351429Z E: Unable to lock directory /var/lib/apt/lists/',
  'playwright-tests / playwright-tests (1)\tUNKNOWN STEP\t2026-06-19T04:20:45.9366576Z Failed to install browsers',
  'playwright-tests / playwright-tests (1)\tUNKNOWN STEP\t2026-06-19T04:20:45.9366841Z Error: Installation process exited with code: 100',
  'playwright-tests / playwright-tests (1)\tUNKNOWN STEP\t2026-06-19T04:20:45.9595126Z ##[error]Process completed with exit code 1.',
  'playwright-tests / playwright-tests (1)\tUNKNOWN STEP\t2026-06-19T04:20:46.6034009Z Stop and remove container',
].join('\n')
const dependencyAptLockLog = aptLockLog.replace('browsers', 'browser dependencies')
const aptWaitTimeoutLog = [
  'test-playwright / playwright-tests (1)\tUNKNOWN STEP\t2026-06-19T04:20:44.7031854Z ##[group]Run ./.github/actions/setup-playwright',
  'test-playwright / playwright-tests (1)\tUNKNOWN STEP\t2026-06-19T04:25:45.9351067Z ::error::Timed out waiting for apt/dpkg locks after 120s: /var/lib/dpkg/lock-frontend',
  'test-playwright / playwright-tests (1)\tUNKNOWN STEP\t2026-06-19T04:25:45.9595126Z ##[error]Process completed with exit code 1.',
].join('\n')
const aptWaitTimeoutLogShardTwo = [
  'test-playwright / playwright-tests (2)\tUNKNOWN STEP\t2026-06-19T04:20:44.7031854Z ##[group]Run ./.github/actions/setup-playwright',
  'test-playwright / playwright-tests (2)\tUNKNOWN STEP\t2026-06-19T04:35:45.9351067Z ::error::Timed out waiting for apt/dpkg locks after 300s: /var/lib/dpkg/lock-frontend',
  'test-playwright / playwright-tests (2)\tUNKNOWN STEP\t2026-06-19T04:35:45.9595126Z ##[error]Process completed with exit code 1.',
].join('\n')
const echoedTimeoutSourceLog = [
  'test-playwright / playwright-tests (1)\tUNKNOWN STEP\t2026-06-19T04:20:44.7031854Z ##[group]Run ./.github/actions/setup-playwright',
  'test-playwright / playwright-tests (1)\tUNKNOWN STEP\t2026-06-19T04:20:44.8031854Z echo "::error::Timed out waiting for apt/dpkg locks after ${timeout_seconds}s: ${busy_paths[*]}"; exit 1',
  'test-playwright / playwright-tests (1)\tUNKNOWN STEP\t2026-06-19T04:22:45.9595126Z ##[error]Process completed with exit code 1.',
].join('\n')

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [playwrightShardOneJobName, playwrightShardTwoJobName, 'tests', 'build'],
  failedJobLogs: () =>
    Promise.resolve(
      new Map([
        [playwrightShardOneJobName, matchingLog],
        [playwrightShardTwoJobName, matchingLog],
      ]),
    ),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

// Production registration and retry accounting are covered through decide()/RULES in
// runner-shutdown-production-rule.test.mts. These direct matcher cases also protect the
// coverage-artifact rules that reuse the same conservative predicate.
describe('runnerShutdownLeafRerunMatch (playwright shards only)', () => {
  it('reruns CI when Playwright shards fail from runner shutdown and only aggregate jobs fail downstream', async () => {
    expect(await runnerShutdownLeafRerunMatch(makeCtx())).toBe(true)
  })

  it('also matches Main CI (web) playwright shard shutdown (previously excluded)', async () => {
    expect(await runnerShutdownLeafRerunMatch(makeCtx({ workflowName: 'Main CI (web)' }))).toBe(
      true,
    )
  })

  it('does not match non-idempotent workflows', async () => {
    expect(await runnerShutdownLeafRerunMatch(makeCtx({ workflowName: 'Stateful workflow' }))).toBe(
      false,
    )
  })

  it('does not match when a non-aggregate job also failed', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeCtx({
        failedJobNames: [playwrightShardOneJobName, 'test-web / web-tests (1)', 'tests', 'build'],
      }),
    )
    expect(matched).toBe(false)
  })

  it('does not match normal Playwright assertion failures', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeCtx({
        failedJobNames: [playwrightShardOneJobName, 'tests', 'build'],
        failedJobLogs: () =>
          Promise.resolve(new Map([[playwrightShardOneJobName, assertionFailureLog]])),
      }),
    )
    expect(matched).toBe(false)
  })
})

describe('main-web-playwright-setup-apt-lock', () => {
  it('reruns Main CI web when a Playwright shard fails before tests on an apt lock', async () => {
    const result = await decide(
      makeCtx({
        workflowName: 'Main CI (web)',
        failedJobNames: [mainWebPlaywrightShardOneJobName],
        failedJobLogs: () =>
          Promise.resolve(new Map([[mainWebPlaywrightShardOneJobName, aptLockLog]])),
      }),
      RULES,
    )
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-playwright-setup-apt-lock')
  })

  it.each([aptLockLog, dependencyAptLockLog])(
    'matches CI workflow apt lock failures with downstream aggregate failures',
    async aptFailureLog => {
      const result = await decide(
        makeCtx({
          workflowName: 'CI',
          failedJobNames: [playwrightShardOneJobName, 'tests', 'build'],
          failedJobLogs: async () => new Map([[playwrightShardOneJobName, aptFailureLog]]),
        }),
        RULES,
      )
      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('main-web-playwright-setup-apt-lock')
    },
  )

  it('matches setup wait timeouts before Playwright install starts', async () => {
    const result = await decide(
      makeCtx({
        workflowName: 'CI',
        failedJobNames: [playwrightShardOneJobName],
        failedJobLogs: () =>
          Promise.resolve(new Map([[playwrightShardOneJobName, aptWaitTimeoutLog]])),
      }),
      RULES,
    )
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-playwright-setup-apt-lock')
  })

  it('matches Main CI web with OTel fan-in and multiple shard apt-lock timeouts', async () => {
    const result = await decide(
      makeCtx({
        workflowName: 'Main CI (web)',
        failedJobNames: [
          mainWebPlaywrightShardOneJobName,
          'playwright-tests / playwright-tests (2)',
          'store-playwright-otel',
        ],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [mainWebPlaywrightShardOneJobName, aptWaitTimeoutLog],
              ['playwright-tests / playwright-tests (2)', aptWaitTimeoutLogShardTwo],
            ]),
          ),
      }),
      RULES,
    )
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-playwright-setup-apt-lock')
  })

  it('matches credentialed Playwright setup timeouts', async () => {
    const result = await decide(
      makeCtx({
        workflowName: 'CI',
        failedJobNames: [credentialedPlaywrightJobName],
        failedJobLogs: () =>
          Promise.resolve(new Map([[credentialedPlaywrightJobName, aptWaitTimeoutLog]])),
      }),
      RULES,
    )
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-playwright-setup-apt-lock')
  })

  it('matches Main CI web credentialed Playwright setup timeouts', async () => {
    const result = await decide(
      makeCtx({
        workflowName: 'Main CI (web)',
        failedJobNames: [mainWebCredentialedPlaywrightJobName],
        failedJobLogs: () =>
          Promise.resolve(new Map([[mainWebCredentialedPlaywrightJobName, aptWaitTimeoutLog]])),
      }),
      RULES,
    )
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-playwright-setup-apt-lock')
  })

  it('matches CI Storybook setup timeouts with Patch Coverage downstream', async () => {
    const result = await decide(
      makeCtx({
        workflowName: 'CI',
        failedJobNames: [storybookJobName, 'Patch Coverage'],
        failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, aptWaitTimeoutLog]])),
      }),
      RULES,
    )
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-playwright-setup-apt-lock')
  })

  it('matches Main CI Storybook setup apt-lock wait timeouts', async () => {
    const result = await decide(
      makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [mainStorybookJobName],
        failedJobLogs: () =>
          Promise.resolve(new Map([[mainStorybookJobName, aptWaitTimeoutLogShardTwo]])),
      }),
      RULES,
    )
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-playwright-setup-apt-lock')
  })

  it('does not treat OTel fan-in as downstream of credentialed Playwright setup', async () => {
    const result = await decide(
      makeCtx({
        workflowName: 'Main CI (web)',
        failedJobNames: [mainWebCredentialedPlaywrightJobName, 'store-playwright-otel'],
        failedJobLogs: () =>
          Promise.resolve(new Map([[mainWebCredentialedPlaywrightJobName, aptWaitTimeoutLog]])),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match timeout strings from echoed setup script source', async () => {
    const result = await decide(
      makeCtx({
        workflowName: 'Main CI (web)',
        failedJobNames: [mainWebPlaywrightShardOneJobName],
        failedJobLogs: () =>
          Promise.resolve(new Map([[mainWebPlaywrightShardOneJobName, echoedTimeoutSourceLog]])),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when another Main CI web job failed', async () => {
    const result = await decide(
      makeCtx({
        workflowName: 'Main CI (web)',
        failedJobNames: [mainWebPlaywrightShardOneJobName, 'test-web / web-tests (1)'],
        failedJobLogs: () =>
          Promise.resolve(new Map([[mainWebPlaywrightShardOneJobName, aptLockLog]])),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match after the retry cap is exhausted', async () => {
    const result = await decide(
      makeCtx({
        workflowName: 'Main CI (web)',
        runAttempt: 2,
        failedJobNames: [mainWebPlaywrightShardOneJobName],
        failedJobLogs: () =>
          Promise.resolve(new Map([[mainWebPlaywrightShardOneJobName, aptLockLog]])),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
