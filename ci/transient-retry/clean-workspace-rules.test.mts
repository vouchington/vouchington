import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const playwrightSelectJobName = 'playwright-tests / select'
const storePlaywrightOtelJobName = 'store-playwright-otel'
const webTestsJobName = 'test-web / web-tests (1)'
const matchingLog = [
  'playwright-tests / select\tUNKNOWN STEP\t2026-06-13T18:10:22.1504456Z ##[group]Run ./.github/actions/clean-workspace',
  'playwright-tests / select\tUNKNOWN STEP\t2026-06-13T18:10:23.1014324Z From https://github.com/vouchington/vouchington',
  'playwright-tests / select\tUNKNOWN STEP\t2026-06-13T18:13:34.6347254Z ##[error]The action has timed out.',
  'playwright-tests / select\tUNKNOWN STEP\t2026-06-13T18:13:34.9128708Z Terminate orphan process: pid (2354652) (git-remote-https)',
].join('\n')
const boundedRetryExhaustionLog = [
  'playwright-tests / select\tUNKNOWN STEP\t2026-06-14T19:10:22.1504456Z ##[group]Run ./.github/actions/clean-workspace',
  'playwright-tests / select\tUNKNOWN STEP\t2026-06-14T19:11:07.1014324Z ::warning::git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main timed out on attempt 1',
  'playwright-tests / select\tUNKNOWN STEP\t2026-06-14T19:11:07.1014324Z ::warning::git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main failed on attempt 1; retrying in 5s',
  'playwright-tests / select\tUNKNOWN STEP\t2026-06-14T19:12:02.1014324Z ::warning::git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main timed out on attempt 2',
  'playwright-tests / select\tUNKNOWN STEP\t2026-06-14T19:12:02.1014324Z ::warning::git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main failed on attempt 2; retrying in 15s',
  'playwright-tests / select\tUNKNOWN STEP\t2026-06-14T19:13:02.1014324Z ::warning::git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main timed out on attempt 3',
  'playwright-tests / select\tUNKNOWN STEP\t2026-06-14T19:13:02.1014324Z ::warning::git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main failed after 3 attempts',
  'playwright-tests / select\tUNKNOWN STEP\t2026-06-14T19:13:02.1014324Z ##[error]Process completed with exit code 1.',
].join('\n')
const deterministicRetryExhaustionLog = boundedRetryExhaustionLog
  .split('\n')
  .filter(line => !line.includes('timed out on attempt'))
  .join('\n')
const selectorRunnerShutdownLog = [
  'playwright-tests / select\tUNKNOWN STEP\t2026-07-04T05:58:41.2472640Z ##[group]Run ./.github/actions/clean-workspace',
  'playwright-tests / select\tUNKNOWN STEP\t2026-07-04T05:58:41.2583949Z shell: /usr/bin/bash --noprofile --norc -e -o pipefail {0}',
  'playwright-tests / select\tUNKNOWN STEP\t2026-07-04T05:58:41.2744836Z ##[error]Process completed with exit code 143.',
  'playwright-tests / select\tUNKNOWN STEP\t2026-07-04T05:58:41.2817229Z ##[error]The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.',
  'playwright-tests / select\tUNKNOWN STEP\t2026-07-04T05:58:41.2938788Z ##[error]The operation was canceled.',
].join('\n')
const selectorLaterRunnerShutdownLog = [
  'playwright-tests / select\tUNKNOWN STEP\t2026-07-04T05:58:41.2472640Z ##[group]Run ./.github/actions/clean-workspace',
  'playwright-tests / select\tUNKNOWN STEP\t2026-07-04T05:58:41.2583949Z workspace already clean',
  'playwright-tests / select\tUNKNOWN STEP\t2026-07-04T05:58:41.2630401Z ##[endgroup]',
  'playwright-tests / select\tUNKNOWN STEP\t2026-07-04T05:58:43.2472640Z ##[group]Run pnpm exec node ci/playwright/ci-select.mts',
  'playwright-tests / select\tUNKNOWN STEP\t2026-07-04T05:58:43.2583949Z Error: no tests selected for changed files',
  'playwright-tests / select\tUNKNOWN STEP\t2026-07-04T05:58:44.2817229Z ##[error]The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.',
  'playwright-tests / select\tUNKNOWN STEP\t2026-07-04T05:58:44.2938788Z ##[error]The operation was canceled.',
].join('\n')
const noArtifactsStoreLog = [
  'Run ./ci/store-playwright-otel.sh',
  '##[error]No Playwright OTel artifacts found',
  '##[error]Process completed with exit code 1.',
].join('\n')
const storeAwsFailureLog = [
  'Run ./ci/store-playwright-otel.sh',
  'fatal error: An error occurred (AccessDenied) when calling the ListObjectsV2 operation',
  '##[error]Process completed with exit code 1.',
].join('\n')
const webRunnerLostCommunicationAnnotation =
  'The self-hosted runner lost communication with the server. Verify the machine is running and has a healthy network connection. Anything in your workflow that terminates the runner process, starves it for CPU/Memory, or blocks its network access can cause this error.'
const webVitestFailureBeforeShutdownLog = [
  'test-web / web-tests (1)\tRun tests\t2026-07-04T05:57:41.2472640Z FAIL web/lib/example.test.ts',
  'test-web / web-tests (1)\tRun tests\t2026-07-04T05:57:41.2583949Z Failed Tests 1',
  'test-web / web-tests (1)\tRun tests\t2026-07-04T05:58:41.2817229Z ##[error]The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.',
  'test-web / web-tests (1)\tRun tests\t2026-07-04T05:58:41.2938788Z ##[error]The operation was canceled.',
].join('\n')

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Main CI (web)',
  conclusion: 'failure',
  runAttempt: 2,
  failedJobNames: [playwrightSelectJobName],
  failedJobLogs: () => Promise.resolve(new Map([[playwrightSelectJobName, matchingLog]])),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

function expectRerun(result: Awaited<ReturnType<typeof decide>>): void {
  expect(`${result.decision}:${result.matchedRule}`).toBe(
    'rerun:playwright-select-clean-workspace-fetch-timeout',
  )
}
function expectDispatch(result: Awaited<ReturnType<typeof decide>>): void {
  expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
}

describe('playwright-select-clean-workspace-fetch-timeout', () => {
  it('reruns the observed Main CI web Playwright selector clean-workspace timeout', async () => {
    const result = await decide(makeCtx(), RULES)
    expectRerun(result)
  })

  it('reruns bounded clean-workspace retry exhaustion after action hardening', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(new Map([[playwrightSelectJobName, boundedRetryExhaustionLog]])),
      }),
      RULES,
    )
    expectRerun(result)
  })

  it('reruns bounded clean-workspace prune fallback retry exhaustion', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                playwrightSelectJobName,
                boundedRetryExhaustionLog.replace(
                  'git fetch --no-tags origin',
                  'git fetch --no-tags --prune origin',
                ),
              ],
            ]),
          ),
      }),
      RULES,
    )
    expectRerun(result)
  })

  it('reruns clean-workspace fetch timeout with downstream OTel no-artifacts failure', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [playwrightSelectJobName, storePlaywrightOtelJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [playwrightSelectJobName, matchingLog],
              [storePlaywrightOtelJobName, noArtifactsStoreLog],
            ]),
          ),
      }),
      RULES,
    )
    expectRerun(result)
  })

  it('reruns selector clean-workspace runner shutdown with known downstream failures', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [playwrightSelectJobName, webTestsJobName, storePlaywrightOtelJobName],
        jobConclusions: new Map([
          [playwrightSelectJobName, 'failure'],
          [webTestsJobName, 'failure'],
          [storePlaywrightOtelJobName, 'failure'],
        ]),
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [playwrightSelectJobName, selectorRunnerShutdownLog],
              [
                webTestsJobName,
                'test-web / web-tests (1)\tRun tests\t2026-07-04T05:58:41.2472640Z waiting for runner',
              ],
              [storePlaywrightOtelJobName, noArtifactsStoreLog],
            ]),
          ),
        failedJobAnnotations: jobName =>
          Promise.resolve(
            jobName === webTestsJobName ? [webRunnerLostCommunicationAnnotation] : [],
          ),
      }),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe('rerun:runner-shutdown-leaf-rerun')
  })

  it('does not match selector runner shutdown after clean-workspace completed', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(new Map([[playwrightSelectJobName, selectorLaterRunnerShutdownLog]])),
      }),
      RULES,
    )
    expectDispatch(result)
  })

  it('does not match unrelated workflows', async () => {
    const result = await decide(makeCtx({ workflowName: 'CI' }), RULES)
    expectDispatch(result)
  })

  it('does not match when another job also failed', async () => {
    const result = await decide(
      makeCtx({ failedJobNames: [playwrightSelectJobName, 'test-web / web-tests (1)'] }),
      RULES,
    )
    expectDispatch(result)
  })

  it('does not match clean-workspace timeouts without a git-remote-https orphan', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([[playwrightSelectJobName, matchingLog.replace('git-remote-https', 'node')]]),
          ),
      }),
      RULES,
    )
    expectDispatch(result)
  })

  it('does not match bounded retry exhaustion outside clean-workspace', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                playwrightSelectJobName,
                boundedRetryExhaustionLog.replace(
                  'Run ./.github/actions/clean-workspace',
                  'Run pnpm exec playwright test',
                ),
              ],
            ]),
          ),
      }),
      RULES,
    )
    expectDispatch(result)
  })

  it('does not match selector runner shutdown with an annotated web failure and missing logs', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [playwrightSelectJobName, webTestsJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [playwrightSelectJobName, selectorRunnerShutdownLog],
              [webTestsJobName, ''],
            ]),
          ),
        failedJobAnnotations: jobName =>
          Promise.resolve(
            jobName === webTestsJobName ? [webRunnerLostCommunicationAnnotation] : [],
          ),
      }),
      RULES,
    )
    expectDispatch(result)
  })

  it('does not match selector runner shutdown with a real web test failure before runner loss', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [playwrightSelectJobName, webTestsJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [playwrightSelectJobName, selectorRunnerShutdownLog],
              [webTestsJobName, webVitestFailureBeforeShutdownLog],
            ]),
          ),
        failedJobAnnotations: jobName =>
          Promise.resolve(
            jobName === webTestsJobName ? [webRunnerLostCommunicationAnnotation] : [],
          ),
      }),
      RULES,
    )
    expectDispatch(result)
  })

  it('does not match selector runner shutdown with an independent OTel store failure', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [playwrightSelectJobName, storePlaywrightOtelJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [playwrightSelectJobName, selectorRunnerShutdownLog],
              [storePlaywrightOtelJobName, storeAwsFailureLog],
            ]),
          ),
      }),
      RULES,
    )
    expectDispatch(result)
  })

  it('does not match bounded retry exhaustion without timeout evidence', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(new Map([[playwrightSelectJobName, deterministicRetryExhaustionLog]])),
      }),
      RULES,
    )
    expectDispatch(result)
  })

  it('does not match after the retry cap is exhausted', async () => {
    const result = await decide(makeCtx({ runAttempt: 3 }), RULES)
    expectDispatch(result)
  })
})
