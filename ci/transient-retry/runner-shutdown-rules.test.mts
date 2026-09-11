import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

// ---------------------------------------------------------------------------
// Shared log fixtures
// ---------------------------------------------------------------------------

const shutdownOnlyMarkers = [
  '##[error]The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.',
  '##[error]The operation was canceled.',
].join('\n')

const shutdownWith143 = [
  '##[error]The runner has received a shutdown signal.',
  '##[error]The operation was canceled.',
  '##[error]Process completed with exit code 143.',
].join('\n')

const shutdownWithRealFailure = [
  '##[error]The runner has received a shutdown signal.',
  '##[error]The operation was canceled.',
  '##[error]Process completed with exit code 1.',
].join('\n')

// ---------------------------------------------------------------------------
// backend-unit consumer
// ---------------------------------------------------------------------------

const backendUnitShardJobName = 'test-backend-unit / backend-tests (1)'

const backendUnitCleanShutdownLog = [
  'pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend-data-stores --shard 1/2',
  '  CI_PROJECT: backend-unit',
  shutdownOnlyMarkers,
].join('\n')

const backendUnitVitestFailLog = [
  'pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend-data-stores --shard 1/2',
  '  CI_PROJECT: backend-unit',
  ' FAIL backend/modules/auth/auth.test.mts > login fails when password is wrong',
  shutdownOnlyMarkers,
].join('\n')

const makeBackendCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Main CI (backend)',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [backendUnitShardJobName],
  failedJobLogs: () =>
    Promise.resolve(new Map([[backendUnitShardJobName, backendUnitCleanShutdownLog]])),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('runner-shutdown-leaf-rerun — backend-unit consumer', () => {
  it('reruns Main CI (backend) when a backend-unit shard is cleanly shutdown', async () => {
    const result = await decide(makeBackendCtx(), RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-shutdown-leaf-rerun')
  })

  it('still reruns when exit code 143 (SIGTERM) accompanies the shutdown markers', async () => {
    const result = await decide(
      makeBackendCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [backendUnitShardJobName, `${backendUnitCleanShutdownLog}\n${shutdownWith143}`],
            ]),
          ),
      }),
      RULES,
    )
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-shutdown-leaf-rerun')
  })

  it('does NOT rerun when a Vitest FAIL line precedes the shutdown markers', async () => {
    const result = await decide(
      makeBackendCtx({
        failedJobLogs: () =>
          Promise.resolve(new Map([[backendUnitShardJobName, backendUnitVitestFailLog]])),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does NOT rerun when exit code 1 is present (non-SIGTERM exit)', async () => {
    const result = await decide(
      makeBackendCtx({
        failedJobLogs: () =>
          Promise.resolve(new Map([[backendUnitShardJobName, shutdownWithRealFailure]])),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does NOT match when a stateful deploy job is also failed', async () => {
    const result = await decide(
      makeBackendCtx({
        failedJobNames: [backendUnitShardJobName, 'deploy-api / deploy'],
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does NOT match an unknown leaf job alongside the backend-unit shard', async () => {
    const result = await decide(
      makeBackendCtx({
        failedJobNames: [backendUnitShardJobName, 'some-unknown / job'],
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('exhausts the cap at runAttempt 3 (maxAttempts: 2)', async () => {
    const result = await decide(makeBackendCtx({ runAttempt: 3 }), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('reruns a runner shutdown first appearing on workflow attempt 4', async () => {
    const result = await decide(
      makeBackendCtx({
        runAttempt: 4,
        ruleAttempts: new Map([['runner-shutdown-leaf-rerun', 1]]),
      }),
      RULES,
    )
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-shutdown-leaf-rerun')
  })
})

describe('runner-shutdown-leaf-rerun — backend-smoke consumer', () => {
  const backendSmokeJobName = 'backend-smoke / smoke'

  it('reruns when the standalone smoke job is cleanly shutdown', async () => {
    const result = await decide(
      makeBackendCtx({
        failedJobNames: [backendSmokeJobName],
        failedJobLogs: () => Promise.resolve(new Map([[backendSmokeJobName, shutdownOnlyMarkers]])),
      }),
      RULES,
    )
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-shutdown-leaf-rerun')
  })

  it('does NOT rerun when a smoke-test failure precedes shutdown markers', async () => {
    const result = await decide(
      makeBackendCtx({
        failedJobNames: [backendSmokeJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [backendSmokeJobName, `✗ Error: server startup timeout\n${shutdownOnlyMarkers}`],
            ]),
          ),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})

// ---------------------------------------------------------------------------
// tooling consumer
// ---------------------------------------------------------------------------

const mainChecksToolingJobName = 'tooling-tests / tooling'
const toolingRunnerCommand = 'node ci/tooling-test-runner.mts --bail=3'

const toolingCleanShutdownLog = [
  toolingRunnerCommand,
  'Test Files  280 passed (280)',
  'Tests       2601 passed (2601)',
  '##[error]The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.',
  '##[error]The operation was canceled.',
].join('\n')

const toolingFailedBeforeShutdownLog = [
  toolingRunnerCommand,
  'Test Files  1 failed | 279 passed (280)',
  '##[error]The runner has received a shutdown signal.',
  '##[error]The operation was canceled.',
].join('\n')

const toolingShutdownNoSummaryLog = [
  toolingRunnerCommand,
  '##[error]The runner has received a shutdown signal.',
  '##[error]The operation was canceled.',
].join('\n')

const makeToolingCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Main CI (checks)',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [mainChecksToolingJobName],
  failedJobLogs: () =>
    Promise.resolve(new Map([[mainChecksToolingJobName, toolingCleanShutdownLog]])),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('runner-shutdown-leaf-rerun — tooling consumer', () => {
  it('reruns Main CI (checks) when tooling passes then shutdown kills the job', async () => {
    const result = await decide(makeToolingCtx(), RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-shutdown-leaf-rerun')
  })

  it('does NOT rerun when the tooling Vitest summary shows a failed file', async () => {
    const result = await decide(
      makeToolingCtx({
        failedJobLogs: () =>
          Promise.resolve(new Map([[mainChecksToolingJobName, toolingFailedBeforeShutdownLog]])),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('reruns when shutdown occurs after tooling starts but before the Vitest summary is emitted', async () => {
    const result = await decide(
      makeToolingCtx({
        failedJobLogs: () =>
          Promise.resolve(new Map([[mainChecksToolingJobName, toolingShutdownNoSummaryLog]])),
      }),
      RULES,
    )
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-shutdown-leaf-rerun')
  })
})

// ---------------------------------------------------------------------------
// playwright consumer — store-playwright-otel conditional downstream
// ---------------------------------------------------------------------------

const playwrightShardJobName = 'test-playwright / playwright-tests (1)'

const playwrightCleanShutdownLog = [
  '$ cross-env NODE_ENV=production next build',
  '##[error]The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.',
  '##[error]The operation was canceled.',
].join('\n')

const makePlaywrightCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [playwrightShardJobName, 'tests', 'build'],
  failedJobLogs: () =>
    Promise.resolve(new Map([[playwrightShardJobName, playwrightCleanShutdownLog]])),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('runner-shutdown-leaf-rerun — playwright + store-playwright-otel', () => {
  it('does NOT allow store-playwright-otel without a downstream conclusion', async () => {
    const result = await decide(
      makePlaywrightCtx({
        failedJobNames: [playwrightShardJobName, 'store-playwright-otel', 'tests', 'build'],
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does NOT allow store-playwright-otel without a playwright shard failure', async () => {
    // store-playwright-otel alone (no playwright shard) is not a known leaf
    const webIntegrationJobName = 'test-web-integration / web-integration-tests (1)'
    const result = await decide(
      makePlaywrightCtx({
        failedJobNames: [webIntegrationJobName, 'store-playwright-otel'],
        failedJobLogs: () =>
          Promise.resolve(new Map([[webIntegrationJobName, playwrightCleanShutdownLog]])),
      }),
      RULES,
    )
    // store-playwright-otel is a leaf (no playwright shard to make it conditional)
    // and it has no consumer entry → dispatch
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
