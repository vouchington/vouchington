import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'
import type { WorkflowJobStep } from './types.mts'

const testCoverageJobName = 'Patch Coverage'
const playwrightShardOneJobName = 'test-playwright / playwright-tests (1)'

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

const patchCoverageDownloadTimeoutLog = [
  '[optional-run-artifacts] result=unavailable selector=pattern exit=2',
  '[optional-run-artifacts] selected artifact=coverage-web-integration',
  '[optional-run-artifacts] selected artifact=coverage-lambdas',
  '[optional-run-artifacts] selection selector=pattern count=2',
  '[optional-run-artifacts] attempt artifact=coverage-web-integration',
  'net/http: TLS handshake timeout',
  '[optional-run-artifacts] result=error selector=pattern exit=1',
  '##[error]Missing coverage artifact for test-web-integration: coverage-web-integration/lcov.info',
  '##[error]Missing expected patch coverage producer group: lambdas',
  '##[error]Process completed with exit code 1.',
].join('\n')

const patchCoverageDownloadActionTimeoutLog = [
  '[optional-run-artifacts] selected artifact=coverage-tooling',
  '[optional-run-artifacts] selected artifact=coverage-lambdas',
  '[optional-run-artifacts] selection selector=pattern count=2',
  '[optional-run-artifacts] attempt artifact=coverage-tooling',
  '##[error]Missing coverage artifact for test-tooling: coverage-tooling/lcov.info',
  '##[error]Missing coverage artifact for test-lambdas: coverage-lambdas/lcov.info',
  '##[error]Process completed with exit code 1.',
].join('\n')
const patchCoverageDownloadActionTimeoutSteps: WorkflowJobStep[] = [
  { name: 'Download coverage artifacts from GitHub (fallback)', conclusion: 'timed_out' },
  { name: 'Prepare coverage artifacts', conclusion: 'failure' },
]

describe('coverage-artifact-download-timeout', () => {
  it('matches a Patch Coverage GitHub artifact download connect timeout', async () => {
    const ctx = makeCtx({
      failedJobNames: [testCoverageJobName],
      failedJobLogs: () =>
        Promise.resolve(new Map([[testCoverageJobName, patchCoverageDownloadTimeoutLog]])),
    })

    const result = await decide(ctx, RULES)

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('coverage-artifact-download-timeout')
  })

  it('matches a Patch Coverage GitHub artifact download action timeout', async () => {
    const ctx = makeCtx({
      failedJobNames: [testCoverageJobName, 'tests', 'build'],
      jobSteps: new Map([[testCoverageJobName, patchCoverageDownloadActionTimeoutSteps]]),
      failedJobLogs: () =>
        Promise.resolve(new Map([[testCoverageJobName, patchCoverageDownloadActionTimeoutLog]])),
    })

    const result = await decide(ctx, RULES)

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('coverage-artifact-download-timeout')
  })

  it('does not match a structured timeout before any artifact download starts', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [testCoverageJobName],
        jobSteps: new Map([[testCoverageJobName, patchCoverageDownloadActionTimeoutSteps]]),
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                testCoverageJobName,
                patchCoverageDownloadActionTimeoutLog.replace(
                  '[optional-run-artifacts] attempt artifact=coverage-tooling\n',
                  '',
                ),
              ],
            ]),
          ),
      }),
      RULES,
    )

    expect([result.decision, result.matchedRule]).toEqual(['dispatch', ''])
  })

  it('does not treat generic GitHub authentication failure as a network transient', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [testCoverageJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                testCoverageJobName,
                patchCoverageDownloadTimeoutLog.replace(
                  'net/http: TLS handshake timeout',
                  'HTTP 401: Bad credentials',
                ),
              ],
            ]),
          ),
      }),
      RULES,
    )

    expect([result.decision, result.matchedRule]).toEqual(['dispatch', ''])
  })

  it('does not let an earlier transport timeout bless a fallback authentication failure', async () => {
    const fallbackAuthenticationLog = patchCoverageDownloadTimeoutLog.replace(
      'net/http: TLS handshake timeout',
      'HTTP 401: Bad credentials',
    )
    const result = await decide(
      makeCtx({
        failedJobNames: [testCoverageJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                testCoverageJobName,
                `net/http: timeout awaiting response headers\n${fallbackAuthenticationLog}`,
              ],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('matches alongside aggregate fan-in failures', async () => {
    const ctx = makeCtx({
      failedJobNames: [testCoverageJobName, 'tests', 'build'],
      failedJobLogs: () =>
        Promise.resolve(new Map([[testCoverageJobName, patchCoverageDownloadTimeoutLog]])),
    })

    const result = await decide(ctx, RULES)

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('coverage-artifact-download-timeout')
  })

  it('does not match a missing coverage artifact without a download timeout', async () => {
    const ctx = makeCtx({
      failedJobNames: [testCoverageJobName],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [
              testCoverageJobName,
              [
                'Coverage artifact layout already uses named directories.',
                '##[error]Missing coverage artifact for test-web-integration: coverage-web-integration/lcov.info',
                '##[error]Process completed with exit code 1.',
              ].join('\n'),
            ],
          ]),
        ),
    })

    const result = await decide(ctx, RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a strict-prefix artifact as the missing suite selection', async () => {
    const ctx = makeCtx({
      failedJobNames: [testCoverageJobName],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [
              testCoverageJobName,
              [
                '[optional-run-artifacts] selected artifact=coverage-web-integration-browser',
                '[optional-run-artifacts] attempt artifact=coverage-web-integration-browser',
                'net/http: timeout awaiting response headers',
                '[optional-run-artifacts] result=unavailable selector=pattern exit=1',
                '##[error]Missing coverage artifact for test-web-integration: coverage-web-integration/lcov.info',
                '##[error]Process completed with exit code 1.',
              ].join('\n'),
            ],
          ]),
        ),
    })

    const result = await decide(ctx, RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when the missing artifact was listed but the download never started', async () => {
    const ctx = makeCtx({
      failedJobNames: [testCoverageJobName],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [
              testCoverageJobName,
              [
                'Found 3 artifact(s)',
                '- coverage-backend-shard-1 (ID: 8459711221, Size: 496142, Expected Digest: sha256:2fd9be21c80d7cdd6cf28dda7003183ef233c5822ebbb3ba8232762bb999292f)',
                '- coverage-backend-shard-2 (ID: 8459722930, Size: 495422, Expected Digest: sha256:9aa1e58822e26606f125899da1d3ee0af32154a1474045e7716b9681d703e0a2)',
                '- coverage-web-integration (ID: 8459843081, Size: 512044, Expected Digest: sha256:6b1e58822e26606f125899da1d3ee0af32154a1474045e7716b9681d703e0b3)',
                "Downloading artifact '8459711221' from 'vouchington/vouchington'",
                "Downloading artifact '8459722930' from 'vouchington/vouchington'",
                '##[error]Unable to download artifact(s): Connect Timeout Error (attempted address: api.github.com:443, timeout: 10000ms)',
                'Coverage artifact layout already uses named directories.',
                '##[error]Missing coverage artifact for test-web-integration: coverage-web-integration/lcov.info',
                '##[error]Process completed with exit code 1.',
              ].join('\n'),
            ],
          ]),
        ),
    })

    const result = await decide(ctx, RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when another failed leaf has a real Playwright failure', async () => {
    const ctx = makeCtx({
      failedJobNames: [playwrightShardOneJobName, testCoverageJobName],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [playwrightShardOneJobName, 'Error: expect(locator).toBeVisible() failed'],
            [testCoverageJobName, patchCoverageDownloadTimeoutLog],
          ]),
        ),
    })

    const result = await decide(ctx, RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match a coverage LCOV upload timeout log (mutually exclusive fingerprint)', async () => {
    const ctx = makeCtx({
      failedJobNames: [testCoverageJobName],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [
              testCoverageJobName,
              [
                'All coverage jobs passed or were skipped',
                'Coverage artifact layout already uses named directories.',
                '##[error]Missing coverage artifact for test-web-integration: coverage-web-integration/lcov.info',
                '##[error]Process completed with exit code 1.',
              ].join('\n'),
            ],
          ]),
        ),
    })

    const result = await decide(ctx, RULES)

    expect(result.matchedRule).not.toBe('coverage-artifact-download-timeout')
  })

  it('does not match the same fingerprint after the retry cap is exhausted', async () => {
    const ctx = makeCtx({
      runAttempt: 2,
      failedJobNames: [testCoverageJobName],
      failedJobLogs: () =>
        Promise.resolve(new Map([[testCoverageJobName, patchCoverageDownloadTimeoutLog]])),
    })

    const result = await decide(ctx, RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
