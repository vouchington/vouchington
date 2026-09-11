import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'
import { buildWebTargetsStepMarker } from './web-build-rules.mts'

const staticWebJobName = 'static-checks / static-web'
const webTestShardTwoJobName = 'test-web / web-tests (2)'
const webIntegrationJobName = 'test-web-integration / web-integration-tests (1)'
const playwrightShardJobName = 'playwright-tests / playwright-tests (2)'
const storePlaywrightOtelJobName = 'store-playwright-otel'

// The marker is retargeted from static-web's now-retired `run: pnpm run build` step to the shared
// `##[group]Run ./.github/actions/build-web-targets` marker -- static-web now builds through the
// same build-web-targets composite as the Playwright/web-integration consumers (#10990).
const silentNextBuildExit = [
  buildWebTargetsStepMarker,
  '▲ Next.js 16.2.9 (Turbopack)',
  '  Creating an optimized production build ...',
  '##[error]Process completed with exit code 1.',
].join('\n')

const runnerShutdownLog = [
  '$ cross-env NODE_ENV=production next build',
  '  Creating an optimized production build ...',
  '##[error]The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.',
  '##[error]The operation was canceled.',
].join('\n')

const noArtifactsStoreLog = [
  'Run ./ci/store-playwright-otel.sh',
  '##[error]No Playwright OTel artifacts found',
  '##[error]Process completed with exit code 1.',
].join('\n')

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Main CI (web)',
  conclusion: 'failure',
  runAttempt: 1,
  jobNames: [staticWebJobName],
  failedJobNames: [staticWebJobName],
  jobConclusions: new Map([[staticWebJobName, 'failure']]),
  failedJobLogs: () => Promise.resolve(new Map([[staticWebJobName, silentNextBuildExit]])),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('main-web-static-build-silent-exit', () => {
  it('reruns when the static-web build exits silently', async () => {
    const result = await decide(makeCtx(), RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-static-build-silent-exit')
  })

  it('matches the mixed Main CI web failure with runner-shutdown companion jobs', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [
          webIntegrationJobName,
          staticWebJobName,
          playwrightShardJobName,
          storePlaywrightOtelJobName,
        ],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [webIntegrationJobName, runnerShutdownLog],
              [staticWebJobName, silentNextBuildExit],
              [playwrightShardJobName, runnerShutdownLog],
              [storePlaywrightOtelJobName, noArtifactsStoreLog],
            ]),
          ),
      }),
      RULES,
    )
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-static-build-silent-exit')
  })

  it('matches downstream OTel no-artifacts failures when the store conclusion is missing', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [staticWebJobName, playwrightShardJobName, storePlaywrightOtelJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [staticWebJobName, silentNextBuildExit],
              [playwrightShardJobName, runnerShutdownLog],
              [storePlaywrightOtelJobName, noArtifactsStoreLog],
            ]),
          ),
      }),
      RULES,
    )
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-web-static-build-silent-exit')
  })

  it('does not rerun a normal Next build compiler error', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                staticWebJobName,
                `${silentNextBuildExit}\nFailed to compile\nModule not found: Can't resolve '@/missing'`,
              ],
            ]),
          ),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not rerun generic web-stack build errors', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                staticWebJobName,
                `${silentNextBuildExit}\n✘ [ERROR] Failed to bundle worker\nError: Build failed`,
              ],
            ]),
          ),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not rerun when an unrelated web-tests shard also fails', async () => {
    const result = await decide(
      makeCtx({
        jobNames: [staticWebJobName, webTestShardTwoJobName],
        failedJobNames: [staticWebJobName, webTestShardTwoJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [staticWebJobName, silentNextBuildExit],
              [webTestShardTwoJobName, 'Test Files  1 failed | 40 passed'],
            ]),
          ),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not rerun unknown companion leaf failures', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [staticWebJobName, 'unknown / job'],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [staticWebJobName, silentNextBuildExit],
              ['unknown / job', runnerShutdownLog],
            ]),
          ),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not rerun after the retry cap is exhausted', async () => {
    const result = await decide(makeCtx({ runAttempt: 2 }), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
