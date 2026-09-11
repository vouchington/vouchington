import { describe, expect, it } from 'vitest'

import { buildBackendCredentialedFailureLog } from './backend-credentialed-fixtures.mts'
import { isBackendCredentialedProviderSmokeTestTransient } from './backend-credentialed-rules.mts'
import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const backendCredentialedJobName = 'test-backend-credentialed / backend-credentialed-tests'

const matchingBedrockTimeoutLog = buildBackendCredentialedFailureLog([
  {
    project: 'backend-bedrock',
    path: 'backend/services/bedrock-embeddings/single/__tests__/index.bedrock.test.mts',
    titlePath:
      'Bedrock Nova multimodal embeddings > returns a 1024-dimensional text embedding from the real Bedrock API',
    markerLines: [
      'Error: Test timed out in 60000ms.',
      'If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".',
    ],
  },
])

const matchingBedrockInternalFailureLog = buildBackendCredentialedFailureLog([
  {
    project: 'backend-bedrock',
    path: 'backend/services/bedrock-embeddings/single/__tests__/index.bedrock.test.mts',
    titlePath:
      'Bedrock Nova multimodal embeddings > returns a 1024-dimensional text embedding from the real Bedrock API',
    markerLines: [
      'InternalFailure: UnknownError',
      "Serialized Error: { '$fault': 'server', '$response': { statusCode: 500, headers: { ':status': 500, 'content-type': 'application/json', 'x-amzn-errortype': 'InternalFailure:http://internal.amazon.com/coral/com.amazon.coral.service/' } } }",
      "sentHeaders: { ':authority': 'bedrock-runtime.us-east-1.amazonaws.com', 'amz-sdk-request': 'attempt=3; max=3' }",
    ],
  },
])

// Verbatim (timestamps stripped, exactly as GitHub Actions reported it) excerpt from PR #10800
// attempt 1, run 33783131824, job 100742259504 — the AWS-SDK abort/timeout this rule previously
// could not see because `backend/tools/search-posts-semantic.bedrock.test.mts` had never been
// hand-fingerprinted (see #10806/#10825).
const realPr10800AbortTimeoutLog = [
  'pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend-aws --project backend-bedrock --project backend-openai --project backend-stripe --coverage "${FILES[@]}"',
  ' ❯  backend-bedrock  backend/tools/search-posts-semantic.bedrock.test.mts (1 test | 1 failed) 6185ms',
  ' FAIL   backend-bedrock  backend/tools/search-posts-semantic.bedrock.test.mts > search-posts-semantic tool Bedrock integration > returns results from real semantic search and clamps limits',
  'AbortError: Request aborted',
  ' ❯ buildAbortError node_modules/.pnpm/@smithy+node-http-handler@4.12.0/node_modules/@smithy/node-http-handler/dist-cjs/index.js:15:32',
  ' ❯ requestBedrockEmbedding backend/services/bedrock-embeddings/single/request.mts:89:20',
  '',
  'Caused by: TimeoutError: The operation was aborted due to timeout',
].join('\n')

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('backend-credentialed-provider-smoke-test-transient (Bedrock variants)', () => {
  it('recognizes the Bedrock Nova embedding timeout', () => {
    expect(isBackendCredentialedProviderSmokeTestTransient(matchingBedrockTimeoutLog)).toBe(true)
  })

  it('matches at any directory depth under backend/, since the composed pattern is a glob', () => {
    expect(
      isBackendCredentialedProviderSmokeTestTransient(
        matchingBedrockTimeoutLog.replace('/single/__tests__/', '/single/nested/deeper/'),
      ),
    ).toBe(true)
  })

  it('matches the Bedrock Nova embedding timeout on attempt 1', async () => {
    const ctx = makeCtx({
      failedJobNames: [backendCredentialedJobName, 'Patch Coverage', 'tests', 'build'],
      failedJobLogs: () =>
        Promise.resolve(new Map([[backendCredentialedJobName, matchingBedrockTimeoutLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-credentialed-provider-smoke-test-transient')
  })

  it('recognizes the real PR #10800 AWS-SDK abort/timeout on a previously-uncovered probe', () => {
    expect(isBackendCredentialedProviderSmokeTestTransient(realPr10800AbortTimeoutLog)).toBe(true)
  })

  it('matches the real PR #10800 log via decide()', async () => {
    const ctx = makeCtx({
      failedJobNames: [backendCredentialedJobName, 'Patch Coverage', 'tests', 'build'],
      failedJobLogs: () =>
        Promise.resolve(new Map([[backendCredentialedJobName, realPr10800AbortTimeoutLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-credentialed-provider-smoke-test-transient')
  })

  it('recognizes the Bedrock Runtime InternalFailure 500 fingerprint', () => {
    expect(isBackendCredentialedProviderSmokeTestTransient(matchingBedrockInternalFailureLog)).toBe(
      true,
    )
  })

  it('recognizes the Bedrock Runtime InternalFailure 500 fingerprint in another region', () => {
    expect(
      isBackendCredentialedProviderSmokeTestTransient(
        matchingBedrockInternalFailureLog.replace(
          'bedrock-runtime.us-east-1.amazonaws.com',
          'bedrock-runtime.us-west-2.amazonaws.com',
        ),
      ),
    ).toBe(true)
  })

  it('matches the Bedrock Runtime InternalFailure on Main CI backend attempt 1', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (backend)',
      failedJobNames: [backendCredentialedJobName],
      failedJobLogs: () =>
        Promise.resolve(new Map([[backendCredentialedJobName, matchingBedrockInternalFailureLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-credentialed-provider-smoke-test-transient')
  })

  it('does not match the Bedrock Runtime InternalFailure after the retry cap is exhausted', async () => {
    const ctx = makeCtx({
      runAttempt: 3,
      ruleAttempts: new Map([['backend-credentialed-provider-smoke-test-transient', 3]]),
      workflowName: 'Main CI (backend)',
      failedJobNames: [backendCredentialedJobName],
      failedJobLogs: () =>
        Promise.resolve(new Map([[backendCredentialedJobName, matchingBedrockInternalFailureLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match unrelated Bedrock assertion failures', async () => {
    const ctx = makeCtx({
      failedJobNames: [backendCredentialedJobName, 'Patch Coverage', 'tests', 'build'],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [
              backendCredentialedJobName,
              buildBackendCredentialedFailureLog([
                {
                  project: 'backend-bedrock',
                  path: 'backend/services/bedrock-embeddings/single/__tests__/index.bedrock.test.mts',
                  markerLines: [
                    'AssertionError: expected embedding length to be 1024',
                    '##[error]Process completed with exit code 1.',
                  ],
                },
              ]),
            ],
          ]),
        ),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a real provider-transport marker attributed to a non-credentialed project', () => {
    const wrongProjectLog = matchingBedrockTimeoutLog.replace('backend-bedrock', 'backend-unit')
    expect(isBackendCredentialedProviderSmokeTestTransient(wrongProjectLog)).toBe(false)
  })

  it('does not match the same fingerprint after the retry cap is exhausted', async () => {
    const ctx = makeCtx({
      runAttempt: 3,
      ruleAttempts: new Map([['backend-credentialed-provider-smoke-test-transient', 3]]),
      failedJobNames: [backendCredentialedJobName, 'Patch Coverage', 'tests', 'build'],
      failedJobLogs: () =>
        Promise.resolve(new Map([[backendCredentialedJobName, matchingBedrockTimeoutLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
