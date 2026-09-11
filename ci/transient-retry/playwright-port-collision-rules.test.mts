import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const playwrightShardOneJobName = 'test-playwright / playwright-tests (1)'
const mainWebPlaywrightShardOneJobName = 'playwright-tests / playwright-tests (1)'
const mainWebPlaywrightCredentialedJobName =
  'playwright-credentialed-tests / playwright-credentialed-tests'
const storePlaywrightOtelJobName = 'store-playwright-otel'

const portCollisionLog = [
  '##[group]Run set -euo pipefail',
  'pnpm exec ./ci/with-node-test-options playwright test --shard=1/2',
  '##[endgroup]',
  '[backend] API Server: serving at http://localhost:52055',
  '[lambdas] Lambda dev server: http://localhost:2603',
  '',
  'Error: http://localhost:3163 is already used, make sure that nothing is running on the port/url or set reuseExistingServer:true in config.webServer.',
  '##[error]Error: http://localhost:3163 is already used, make sure that nothing is running on the port/url or set reuseExistingServer:true in config.webServer.',
  '',
  '##[error]Process completed with exit code 1.',
].join('\n')
const nextServerPortCollisionLog = [
  '##[group]Run set -euo pipefail',
  'pnpm exec ./ci/with-node-test-options playwright test --shard=1/2',
  '##[endgroup]',
  '[backend] API Server: serving at http://localhost:44911',
  '[lambdas] Lambda dev server: http://localhost:53993',
  '[web] ⨯ Failed to start server',
  '[web] Error: listen EADDRINUSE: address already in use 0.0.0.0:3219',
  '[web]     at <unknown> (Error: listen EADDRINUSE: address already in use 0.0.0.0:3219) {',
  "[web]   code: 'EADDRINUSE',",
  '[web]   errno: -98,',
  "[web]   syscall: 'listen',",
  "[web]   address: '0.0.0.0',",
  '[web]   port: 3219',
  '[web] }',
  'Error: Process from config.webServer was not able to start. Exit code: 1',
  '##[error]Error: Process from config.webServer was not able to start. Exit code: 1',
  '##[error]Process completed with exit code 1.',
].join('\n')
const postSpecPortCollisionLookalikeLog = [
  '##[group]Run set -euo pipefail',
  'pnpm exec ./ci/with-node-test-options playwright test --shard=1/2',
  '##[endgroup]',
  'Running 849 tests using 3 workers, shard 1 of 2',
  'Error: http://localhost:3163 is already used, make sure that nothing is running on the port/url or set reuseExistingServer:true in config.webServer.',
  '##[error]Process completed with exit code 1.',
].join('\n')
const postSpecNextServerPortCollisionLookalikeLog = [
  '##[group]Run set -euo pipefail',
  'pnpm exec ./ci/with-node-test-options playwright test --shard=1/2',
  '##[endgroup]',
  'Running 849 tests using 3 workers, shard 1 of 2',
  '[web] ⨯ Failed to start server',
  '[web] Error: listen EADDRINUSE: address already in use 0.0.0.0:3219',
  "[web]   code: 'EADDRINUSE',",
  'Error: Process from config.webServer was not able to start. Exit code: 1',
  '##[error]Process completed with exit code 1.',
].join('\n')
const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Main CI (web)',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [mainWebPlaywrightShardOneJobName],
  failedJobLogs: () =>
    Promise.resolve(new Map([[mainWebPlaywrightShardOneJobName, portCollisionLog]])),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('main-web-playwright-reserved-port-collision', () => {
  it('reruns Main CI web when a Playwright shard finds the reserved web port already bound before specs start', async () => {
    const result = await decide(makeCtx(), RULES)

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-playwright-reserved-port-collision')
  })

  it('reruns Main CI web when Next.js reports the reserved web port already bound before specs start', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([[mainWebPlaywrightShardOneJobName, nextServerPortCollisionLog]]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-playwright-reserved-port-collision')
  })

  it('reruns Main CI web when Next.js strips the start marker and formats EADDRINUSE with double quotes on another address', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                mainWebPlaywrightShardOneJobName,
                nextServerPortCollisionLog
                  .replace('[web] ⨯ Failed to start server', '[web] Failed to start server')
                  .replaceAll('0.0.0.0:3219', '127.0.0.1:3219')
                  .replace("[web]   address: '0.0.0.0',", "[web]   address: '127.0.0.1',")
                  .replace("[web]   code: 'EADDRINUSE',", '[web]   code:   "EADDRINUSE",'),
              ],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-playwright-reserved-port-collision')
  })

  it('allows downstream OTel fan-in failure caused by the failed shard', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [mainWebPlaywrightShardOneJobName, storePlaywrightOtelJobName],
        jobConclusions: new Map([
          [mainWebPlaywrightShardOneJobName, 'failure'],
          [storePlaywrightOtelJobName, 'failure'],
        ]),
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [mainWebPlaywrightShardOneJobName, portCollisionLog],
              [storePlaywrightOtelJobName, '##[error]No Playwright OTel artifacts found'],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-playwright-reserved-port-collision')
  })

  it('does not match outside Main CI web', async () => {
    const result = await decide(
      makeCtx({
        workflowName: 'CI',
        failedJobNames: [playwrightShardOneJobName],
        failedJobLogs: () =>
          Promise.resolve(new Map([[playwrightShardOneJobName, portCollisionLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match once specs have started', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([[mainWebPlaywrightShardOneJobName, postSpecPortCollisionLookalikeLog]]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a Next.js bind failure after specs have started', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [mainWebPlaywrightShardOneJobName, postSpecNextServerPortCollisionLookalikeLog],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a credentialed Playwright shard port collision look-alike', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [mainWebPlaywrightCredentialedJobName],
        failedJobLogs: () =>
          Promise.resolve(new Map([[mainWebPlaywrightCredentialedJobName, portCollisionLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when another Main CI web job failed', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [mainWebPlaywrightShardOneJobName, 'test-web / web-tests (1)'],
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match after the retry cap is exhausted', async () => {
    const result = await decide(
      makeCtx({
        runAttempt: 2,
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
