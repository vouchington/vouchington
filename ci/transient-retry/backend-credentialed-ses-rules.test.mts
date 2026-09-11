import { describe, expect, it } from 'vitest'

import {
  buildBackendCredentialedFailureBlock,
  buildBackendCredentialedFailureLog,
} from './backend-credentialed-fixtures.mts'
import { isBackendCredentialedProviderSmokeTestTransient } from './backend-credentialed-rules.mts'
import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const backendCredentialedJobName = 'test-backend-credentialed / backend-credentialed-tests'

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('backend-credentialed-provider-smoke-test-transient (SES variant)', () => {
  // `backend-aws`'s real testTimeout is 60_000 (vitest.config.mts) — a stale `120000ms` literal
  // here was the live #10806/#10825 bug: the old per-test regex could never match.
  const matchingSesLog = buildBackendCredentialedFailureLog([
    {
      project: 'backend-aws',
      path: 'backend/modules/aws/ses.generated.test.mts',
      titlePath: 'ses.generated > sendEmail',
      markerLines: [
        'Error: Test timed out in 60000ms.',
        'If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".',
        'backend/modules/aws/ses.generated.test.mts:9:3',
      ],
    },
  ])

  it('recognizes the GitHub log excerpt for the SES sendEmail timeout at the real 60000ms testTimeout', () => {
    expect(isBackendCredentialedProviderSmokeTestTransient(matchingSesLog)).toBe(true)
  })

  it('matches the SES sendEmail timeout on Main CI backend attempt 1', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (backend)',
      failedJobNames: [backendCredentialedJobName],
      failedJobLogs: () => Promise.resolve(new Map([[backendCredentialedJobName, matchingSesLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('backend-credentialed-provider-smoke-test-transient')
  })

  it('does not match unrelated SES assertion failures', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (backend)',
      failedJobNames: [backendCredentialedJobName],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [
              backendCredentialedJobName,
              buildBackendCredentialedFailureLog([
                {
                  project: 'backend-aws',
                  path: 'backend/modules/aws/ses.generated.test.mts',
                  titlePath: 'ses.generated > sendEmail',
                  markerLines: [
                    'AssertionError: expected undefined to be defined',
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

  it('does not match an SES assertion failure paired with another test timeout', async () => {
    const mixedFailureLog = [
      buildBackendCredentialedFailureBlock({
        project: 'backend-aws',
        path: 'backend/modules/aws/ses.generated.test.mts',
        titlePath: 'ses.generated > sendEmail',
        markerLines: [
          'AssertionError: expected undefined to be defined',
          'backend/modules/aws/ses.generated.test.mts:9:3',
        ],
      }),
      buildBackendCredentialedFailureBlock({
        project: 'backend-openai',
        path: 'backend/modules/openai/client.openai.test.mts',
        titlePath: 'openai.client > returns chat completions',
        markerLines: [
          'Error: Test timed out in 60000ms.',
          'backend/modules/openai/client.openai.test.mts:42:3',
        ],
      }),
      '##[error]Process completed with exit code 1.',
    ].join('\n')
    const ctx = makeCtx({
      workflowName: 'Main CI (backend)',
      failedJobNames: [backendCredentialedJobName],
      failedJobLogs: () =>
        Promise.resolve(new Map([[backendCredentialedJobName, mixedFailureLog]])),
    })

    expect(isBackendCredentialedProviderSmokeTestTransient(mixedFailureLog)).toBe(false)

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match the SES fingerprint in unrelated workflows', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (web)',
      failedJobNames: [backendCredentialedJobName],
      failedJobLogs: () => Promise.resolve(new Map([[backendCredentialedJobName, matchingSesLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match the SES fingerprint after the retry cap is exhausted', async () => {
    const ctx = makeCtx({
      runAttempt: 3,
      ruleAttempts: new Map([['backend-credentialed-provider-smoke-test-transient', 3]]),
      workflowName: 'Main CI (backend)',
      failedJobNames: [backendCredentialedJobName],
      failedJobLogs: () => Promise.resolve(new Map([[backendCredentialedJobName, matchingSesLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
