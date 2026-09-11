import { describe, expect, it } from 'vitest'

import {
  buildBackendCredentialedFailureBlock,
  buildBackendCredentialedFailureLog,
} from './backend-credentialed-fixtures.mts'
import { isBackendCredentialedProviderSmokeTestTransient } from './backend-credentialed-rules.mts'
import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const backendCredentialedJobName = 'test-backend-credentialed / backend-credentialed-tests'
const backendUnitJobName = 'test-backend-unit / backend-tests (1)'

const matchingBedrockTimeoutLog = buildBackendCredentialedFailureLog([
  {
    project: 'backend-bedrock',
    path: 'backend/services/bedrock-embeddings/single/__tests__/index.bedrock.test.mts',
    titlePath:
      'Bedrock Nova multimodal embeddings > returns a 1024-dimensional text embedding from the real Bedrock API',
    markerLines: [
      'Error: Test timed out in 30000ms.',
      'If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".',
    ],
  },
])

// Two credentialed OpenAI probes failing simultaneously from one shared provider-side 500 — the
// only shape that exercises hasOnlyVitestFailuresWithMarkers's every-block branch.
const matchingOpenAIServerErrorLog = buildBackendCredentialedFailureLog([
  {
    project: 'backend-openai',
    path: 'backend/agents/_shared/__tests__/create-response.openai.test.mts',
    titlePath:
      'agents._shared.create-response > createOpenAIResponse returns a non-empty text response',
    markerLines: [
      'Error: 500 The server had an error processing your request. Sorry about that!',
      'OpenAI.makeStatusError node_modules/.pnpm/openai/node_modules/openai/src/client.ts:636:27',
      'backend/agents/_shared/__tests__/create-response.openai.test.mts:18:24',
    ],
  },
  {
    project: 'backend-openai',
    path: 'backend/agents/autotagger/__tests__/openai-autotagger.openai.test.mts',
    titlePath:
      'callOpenAIAutotagger > runs with real OpenAI call and persists conversation run metadata',
    markerLines: [
      'Error: 500 The server had an error processing your request. Sorry about that!',
      'OpenAI.makeStatusError node_modules/.pnpm/openai/node_modules/openai/src/client.ts:636:27',
      'backend/agents/autotagger/__tests__/openai-autotagger.openai.test.mts:35:22',
    ],
  },
])

const backendUnitWorkerExitAfterPassLog = [
  'pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend --shard 1/2 --coverage',
  'Vitest caught 1 unhandled error during the test run.',
  'Unhandled Error',
  'Error: [vitest-pool]: Worker forks emitted error.',
  'Caused by: Error: Worker exited unexpectedly',
  'Test Files  971 passed | 3 skipped (975)',
  'Tests  6581 passed | 10 skipped (6592)',
  'Errors  1 error',
  '##[error]Process completed with exit code 1.',
].join('\n')

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Main CI (backend)',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('backend-credentialed-provider-smoke-test-transient (OpenAI server errors)', () => {
  it('recognizes provider-side OpenAI 500s across credentialed smoke tests', () => {
    expect(isBackendCredentialedProviderSmokeTestTransient(matchingOpenAIServerErrorLog)).toBe(true)
  })

  it('does not treat mixed OpenAI provider and assertion failures as provider 500s', () => {
    const mixedFailureLog = [
      matchingOpenAIServerErrorLog,
      buildBackendCredentialedFailureBlock({
        project: 'backend-openai',
        path: 'backend/modules/openai/client.openai.test.mts',
        titlePath: 'openai.client > returns chat completions',
        markerLines: ['AssertionError: expected response text to be non-empty'],
      }),
    ].join('\n')

    expect(isBackendCredentialedProviderSmokeTestTransient(mixedFailureLog)).toBe(false)
  })

  it('does not treat OpenAI provider 500s without the credentialed Vitest command as retryable', () => {
    const logWithoutCommand = matchingOpenAIServerErrorLog
      .split('\n')
      .filter(line => !line.startsWith('pnpm exec ./ci/with-node-test-options vitest run'))
      .join('\n')

    expect(isBackendCredentialedProviderSmokeTestTransient(logWithoutCommand)).toBe(false)
  })

  it('does not treat OpenAI provider 500s mixed with non-test terminal errors as retryable', () => {
    const mixedTerminalErrorLogs = [
      [
        matchingOpenAIServerErrorLog,
        'Vitest caught 1 unhandled error during the test run.',
        'Unhandled Rejection',
        'Error: leaked async teardown rejection',
      ].join('\n'),
      [
        matchingOpenAIServerErrorLog,
        'Error: Coverage report generation failed after tests completed',
      ].join('\n'),
      [matchingOpenAIServerErrorLog, 'Error: default reporter failed after tests completed'].join(
        '\n',
      ),
    ]

    expect(
      mixedTerminalErrorLogs.map(log => isBackendCredentialedProviderSmokeTestTransient(log)),
    ).toEqual([false, false, false])
  })

  it('does not treat OpenAI assertion failures as provider 500s', () => {
    const assertionLog = buildBackendCredentialedFailureLog([
      {
        project: 'backend-openai',
        path: 'backend/agents/autotagger/__tests__/openai-autotagger.openai.test.mts',
        titlePath:
          'callOpenAIAutotagger > runs with real OpenAI call and persists conversation run metadata',
        markerLines: [
          'AssertionError: expected metadata to be persisted',
          '##[error]Process completed with exit code 1.',
        ],
      },
    ])

    expect(isBackendCredentialedProviderSmokeTestTransient(assertionLog)).toBe(false)
  })

  it('matches OpenAI provider-side 500s on Main CI backend attempt 1', async () => {
    const ctx = makeCtx({
      failedJobNames: [backendCredentialedJobName],
      failedJobLogs: () =>
        Promise.resolve(new Map([[backendCredentialedJobName, matchingOpenAIServerErrorLog]])),
    })

    const result = await decide(ctx, RULES)

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-credentialed-provider-smoke-test-transient')
  })

  it('matches paired OpenAI 500 and backend unit worker-exit transients on Main CI backend', async () => {
    const ctx = makeCtx({
      failedJobNames: [backendCredentialedJobName, backendUnitJobName],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [backendCredentialedJobName, matchingOpenAIServerErrorLog],
            [backendUnitJobName, backendUnitWorkerExitAfterPassLog],
          ]),
        ),
    })

    const result = await decide(ctx, RULES)

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('main-backend-credentialed-provider-and-unit-worker-exit')
    expect(result.rerunJobId).toBeUndefined()
  })

  it('does not match paired non-OpenAI provider transients mixed with non-test terminal errors', async () => {
    const ctx = makeCtx({
      failedJobNames: [backendCredentialedJobName, backendUnitJobName],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [
              backendCredentialedJobName,
              [
                matchingBedrockTimeoutLog,
                'Vitest caught 1 unhandled error during the test run.',
                'Error: default reporter failed after tests completed',
              ].join('\n'),
            ],
            [backendUnitJobName, backendUnitWorkerExitAfterPassLog],
          ]),
        ),
    })

    const result = await decide(ctx, RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match the paired transient after the retry cap is exhausted', async () => {
    const ctx = makeCtx({
      runAttempt: 2,
      failedJobNames: [backendCredentialedJobName, backendUnitJobName],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [backendCredentialedJobName, matchingOpenAIServerErrorLog],
            [backendUnitJobName, backendUnitWorkerExitAfterPassLog],
          ]),
        ),
    })

    const result = await decide(ctx, RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
