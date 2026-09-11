import { describe, expect, it } from 'vitest'

import { buildBackendCredentialedFailureLog } from './backend-credentialed-fixtures.mts'
import { isBackendCredentialedProviderSmokeTestTransient } from './backend-credentialed-rules.mts'
import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const backendCredentialedJobName = 'test-backend-credentialed / backend-credentialed-tests'

const matchingOpenAILog = buildBackendCredentialedFailureLog([
  {
    project: 'backend-openai',
    path: 'backend/agents/autotagger/__tests__/openai-autotagger.openai.test.mts',
    titlePath:
      'callOpenAIAutotagger > runs with real OpenAI call and persists conversation run metadata',
    markerLines: [
      "Error: 429 We're currently processing too many requests - please try again later.",
      "Serialized Error: { status: 429, error: { type: 'invalid_request_error', code: 'rate_limit_exceeded' }, code: 'rate_limit_exceeded' }",
      'backend/agents/autotagger/__tests__/openai-autotagger.openai.test.mts:35:22',
    ],
  },
])

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('backend-credentialed-provider-smoke-test-transient (OpenAI rate-limit variant)', () => {
  it('recognizes the OpenAI autotagger rate-limit fingerprint', () => {
    expect(isBackendCredentialedProviderSmokeTestTransient(matchingOpenAILog)).toBe(true)
  })

  it('matches the OpenAI autotagger rate limit on Main CI backend attempt 1', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (backend)',
      failedJobNames: [backendCredentialedJobName],
      failedJobLogs: () =>
        Promise.resolve(new Map([[backendCredentialedJobName, matchingOpenAILog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-credentialed-provider-smoke-test-transient')
  })

  it('does not match OpenAI assertion failures', async () => {
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

  it('matches OpenAI 429s on the second matching occurrence', async () => {
    const ctx = makeCtx({
      runAttempt: 2,
      ruleAttempts: new Map([['backend-credentialed-provider-smoke-test-transient', 1]]),
      workflowName: 'Main CI (backend)',
      failedJobNames: [backendCredentialedJobName],
      failedJobLogs: () =>
        Promise.resolve(new Map([[backendCredentialedJobName, matchingOpenAILog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-credentialed-provider-smoke-test-transient')
  })

  it('does not match OpenAI 429s after the retry cap is exhausted', async () => {
    const ctx = makeCtx({
      runAttempt: 3,
      ruleAttempts: new Map([['backend-credentialed-provider-smoke-test-transient', 3]]),
      workflowName: 'Main CI (backend)',
      failedJobNames: [backendCredentialedJobName],
      failedJobLogs: () =>
        Promise.resolve(new Map([[backendCredentialedJobName, matchingOpenAILog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
