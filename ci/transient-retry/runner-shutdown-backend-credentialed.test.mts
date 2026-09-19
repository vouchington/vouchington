import { describe, expect, it } from 'vitest'

import { runnerShutdownLeafRerunMatch } from './runner-shutdown-consumers.mts'
import type { WorkflowRunContext } from './types.mts'

// runnerShutdownLeafRerunMatch is no longer registered as a standalone TransientRetryRule (see the
// comment on idempotentWorkflows in runner-shutdown-consumers.mts) -- exercised directly here rather
// than through decide()/RULES. See runner-shutdown-web-rules.test.mts for the web consumers.

const backendCredentialedJobName = 'test-backend-credentialed / backend-credentialed-tests'

const shutdownOnlyMarkers = [
  '##[error]The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.',
  '##[error]The operation was canceled.',
].join('\n')

const backendCredentialedCleanShutdownLog = [
  'pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend-aws --project backend-bedrock --project backend-openai --project backend-stripe --coverage',
  '  CI_PROJECT: backend-credentialed',
  ' RUN  v4.1.9 /home/runner/actions-runner/4/_work/filaments/filaments',
  'Coverage enabled with v8',
  '##[error]The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.',
  'undefined',
  "ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command was killed with SIGKILL (Forced termination): ./ci/with-node-test-options vitest run '--bail=3' --project backend-aws --project backend-bedrock --project backend-openai --project backend-stripe --coverage",
  '##[error]The operation was canceled.',
].join('\n')

const backendCredentialedVitestFailLog = [
  'pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend-aws --project backend-bedrock --project backend-openai --project backend-stripe --coverage',
  'FAIL backend-openai backend/modules/openai/client.openai.test.mts > openai.client > returns chat completions',
  'AssertionError: expected 500 to be 200',
  shutdownOnlyMarkers,
].join('\n')

const backendCredentialedNonAssertionFailLog = [
  'pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend-aws --project backend-bedrock --project backend-openai --project backend-stripe --coverage',
  'FAIL backend-stripe backend/modules/stripe/webhook.test.mts > stripe.webhook > parses event',
  'TypeError: Cannot read properties of undefined (reading "id")',
  shutdownOnlyMarkers,
].join('\n')

const backendCredentialedUnhandledErrorLog = [
  'pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend-aws --project backend-bedrock --project backend-openai --project backend-stripe --coverage',
  'Vitest caught 1 unhandled error during the test run.',
  'Errors  1 error',
  'Unhandled Errors',
  'TypeError: Cannot read properties of undefined (reading "provider")',
  shutdownOnlyMarkers,
].join('\n')

const backendCredentialedSetupFailureBeforeVitestLog = [
  'Run Check backend credentialed test credentials',
  '::error::None of AWS_TEST_ROLE_ARN, OPENAI_API_KEY, or STRIPE_SECRET_KEY is set. At least one must be configured.',
  shutdownOnlyMarkers,
].join('\n')

const makeBackendCredentialedCtx = (
  overrides: Partial<WorkflowRunContext> = {},
): WorkflowRunContext => ({
  workflowName: 'Main CI (backend)',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [backendCredentialedJobName],
  failedJobLogs: () =>
    Promise.resolve(new Map([[backendCredentialedJobName, backendCredentialedCleanShutdownLog]])),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('runnerShutdownLeafRerunMatch — backend-credentialed consumer', () => {
  it('reruns Main CI (backend) when backend credentialed tests are cleanly shutdown', async () => {
    expect(await runnerShutdownLeafRerunMatch(makeBackendCredentialedCtx())).toBe(true)
  })

  it('treats Patch Coverage as downstream when backend credentialed tests are cleanly shutdown', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeBackendCredentialedCtx({
        failedJobNames: [backendCredentialedJobName, 'Patch Coverage', 'tests', 'build'],
      }),
    )
    expect(matched).toBe(true)
  })

  it('treats the reusable Patch Coverage aggregate as downstream', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeBackendCredentialedCtx({
        failedJobNames: [
          backendCredentialedJobName,
          'Patch Coverage / Patch Coverage',
          'tests-processing / tests-processing',
          'tests',
          'build',
        ],
      }),
    )
    expect(matched).toBe(true)
  })

  it('does NOT rerun when backend credentialed Vitest reports a real failure', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeBackendCredentialedCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([[backendCredentialedJobName, backendCredentialedVitestFailLog]]),
          ),
      }),
    )
    expect(matched).toBe(false)
  })

  it('does NOT rerun when backend credentialed Vitest reports a non-assertion failure', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeBackendCredentialedCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([[backendCredentialedJobName, backendCredentialedNonAssertionFailLog]]),
          ),
      }),
    )
    expect(matched).toBe(false)
  })

  it('does NOT rerun when backend credentialed Vitest reports an unhandled error section', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeBackendCredentialedCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([[backendCredentialedJobName, backendCredentialedUnhandledErrorLog]]),
          ),
      }),
    )
    expect(matched).toBe(false)
  })

  it('does NOT rerun when credential setup fails before backend credentialed Vitest starts', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeBackendCredentialedCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([[backendCredentialedJobName, backendCredentialedSetupFailureBeforeVitestLog]]),
          ),
      }),
    )
    expect(matched).toBe(false)
  })
})
