import { describe, expect, it } from 'vitest'

import { buildBackendCredentialedFailureLog } from './backend-credentialed-fixtures.mts'
import { isBackendCredentialedProviderSmokeTestTransient } from './backend-credentialed-rules.mts'
import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const backendCredentialedJobName = 'test-backend-credentialed / backend-credentialed-tests'

const matchingLog = buildBackendCredentialedFailureLog([
  {
    project: 'backend-stripe',
    path: 'backend/modules/stripe/client.stripe.test.mts',
    titlePath: 'stripe.client > connects to Stripe and retrieves balance',
    markerLines: [
      'Error: Test timed out in 30000ms.',
      'If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".',
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

describe('backend-credentialed-provider-smoke-test-transient (Stripe variant)', () => {
  it('recognizes the GitHub log excerpt with repeated stack locations', () => {
    const log = buildBackendCredentialedFailureLog([
      {
        project: 'backend-stripe',
        path: 'backend/modules/stripe/client.stripe.test.mts',
        titlePath: 'stripe.client > connects to Stripe and retrieves balance',
        markerLines: [
          'Error: Test timed out in 30000ms.',
          'backend/modules/stripe/client.stripe.test.mts:13:26',
          '##[error]Error: Test timed out in 30000ms.',
          'If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".',
          'backend/modules/stripe/client.stripe.test.mts:13:26',
        ],
      },
    ])
    expect(isBackendCredentialedProviderSmokeTestTransient(log)).toBe(true)
  })

  it('matches the Stripe balance retrieval timeout on attempt 1', async () => {
    const ctx = makeCtx({
      failedJobNames: [backendCredentialedJobName, 'Patch Coverage', 'tests', 'build'],
      failedJobLogs: () => Promise.resolve(new Map([[backendCredentialedJobName, matchingLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-credentialed-provider-smoke-test-transient')
  })

  it('does not match unrelated backend credentialed failures', async () => {
    const ctx = makeCtx({
      failedJobNames: [backendCredentialedJobName, 'Patch Coverage', 'tests', 'build'],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [
              backendCredentialedJobName,
              buildBackendCredentialedFailureLog([
                {
                  project: 'backend-openai',
                  path: 'backend/modules/openai/client.openai.test.mts',
                  markerLines: [
                    'AssertionError: expected 500 to be 200',
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

  it('does not match when another leaf job also failed', async () => {
    const ctx = makeCtx({
      failedJobNames: [
        backendCredentialedJobName,
        'test-backend-unit / backend-tests (1)',
        'tests',
        'build',
      ],
      failedJobLogs: () => Promise.resolve(new Map([[backendCredentialedJobName, matchingLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match the same fingerprint after the retry cap is exhausted', async () => {
    const ctx = makeCtx({
      runAttempt: 3,
      ruleAttempts: new Map([['backend-credentialed-provider-smoke-test-transient', 3]]),
      failedJobNames: [backendCredentialedJobName, 'Patch Coverage', 'tests', 'build'],
      failedJobLogs: () => Promise.resolve(new Map([[backendCredentialedJobName, matchingLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
