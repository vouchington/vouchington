import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const staticAnalysisJobName = 'static-code-analysis / static-code-analysis'

const cloudflareWorkerCrashLog = [
  '##[group]Run pnpm exec tsc --noEmit --project cloudflare-worker/tsconfig.json',
  'pnpm exec tsc --noEmit --project cloudflare-worker/tsconfig.json',
  'runtime: g 99: unexpected return pc for github.com/microsoft/typescript-go/internal/parser.(*Parser).parseArrowFunctionExpressionBody called from 0x72656e6e75722d73',
  'fatal error: unknown caller pc',
  'github.com/microsoft/typescript-go/internal/parser.(*Parser).parseObjectLiteralElement(0x4e559ba1e008)',
  '##[error]Process completed with exit code 2.',
].join('\n')

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [staticAnalysisJobName, 'tests', 'build'],
  failedJobLogs: () =>
    Promise.resolve(new Map([[staticAnalysisJobName, cloudflareWorkerCrashLog]])),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('cloudflare-worker-tsc-runtime-unknown-caller-pc', () => {
  it('matches the Cloudflare Worker tsc runtime crash on attempt 1', async () => {
    const result = await decide(makeCtx(), RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('cloudflare-worker-tsc-runtime-unknown-caller-pc')
  })

  it('does not hide an independent reusable Patch Coverage failure', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [
          staticAnalysisJobName,
          'Patch Coverage / Patch Coverage',
          'tests',
          'build',
        ],
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
  })

  it('does not match static analysis failures without the tsc runtime fingerprint', async () => {
    const ctx = makeCtx({
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [
              staticAnalysisJobName,
              [
                'pnpm exec tsc --noEmit --project cloudflare-worker/tsconfig.json',
                "cloudflare-worker/src/index.mts(1,1): error TS2304: Cannot find name 'x'.",
                '##[error]Process completed with exit code 2.',
              ].join('\n'),
            ],
          ]),
        ),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when a later lambdas tsc step has the runtime crash', async () => {
    const ctx = makeCtx({
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [
              staticAnalysisJobName,
              [
                '##[group]Run pnpm exec tsc --noEmit --project cloudflare-worker/tsconfig.json',
                'pnpm exec tsc --noEmit --project cloudflare-worker/tsconfig.json',
                '##[endgroup]',
                '2026-06-01T04:30:00.0000000Z ##[group]Run pnpm exec tsc --noEmit --project lambdas/tsconfig.json',
                'pnpm exec tsc --noEmit --project lambdas/tsconfig.json',
                'runtime: g 99: unexpected return pc for github.com/microsoft/typescript-go/internal/parser.(*Parser).parseArrowFunctionExpressionBody called from 0x72656e6e75722d73',
                'fatal error: unknown caller pc',
                '##[error]Process completed with exit code 2.',
              ].join('\n'),
            ],
          ]),
        ),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when an additional non-aggregate job fails', async () => {
    const result = await decide(
      makeCtx({ failedJobNames: [staticAnalysisJobName, 'test-web'] }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match the same tsc runtime crash after the retry cap is exhausted', async () => {
    const result = await decide(makeCtx({ runAttempt: 2 }), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
