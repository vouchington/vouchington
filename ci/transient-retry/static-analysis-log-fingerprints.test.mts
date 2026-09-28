import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
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
  workflowName: 'Static',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [staticAnalysisJobName, 'static'],
  failedJobLogs: () =>
    Promise.resolve(new Map([[staticAnalysisJobName, cloudflareWorkerCrashLog]])),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('cloudflare-worker-tsc-runtime-unknown-caller-pc', () => {
  it('matches the unconditional Static job that owns the Cloudflare Worker compiler gate', async () => {
    const result = await decide(makeCtx(), RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('cloudflare-worker-tsc-runtime-unknown-caller-pc')
  })

  it('does not hide an independent Patch Coverage failure', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [staticAnalysisJobName, 'coverage / Patch Coverage', 'static'],
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
  })

  it('does not match TypeScript diagnostics', async () => {
    const result = await decide(
      makeCtx({
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
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when a later static-analysis step owns the runtime crash', async () => {
    const log = [
      '##[group]Run pnpm exec tsc --noEmit --project cloudflare-worker/tsconfig.json',
      'pnpm exec tsc --noEmit --project cloudflare-worker/tsconfig.json',
      '##[endgroup]',
      '##[group]Run pnpm exec oxlint --type-aware --deny-warnings',
      'runtime: g 99: unexpected return pc',
      'fatal error: unknown caller pc',
      '##[error]Process completed with exit code 2.',
    ].join('\n')
    const result = await decide(
      makeCtx({ failedJobLogs: () => Promise.resolve(new Map([[staticAnalysisJobName, log]])) }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match the same runtime crash from another workflow', async () => {
    const result = await decide(makeCtx({ workflowName: 'Cloudflare Worker' }), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match after the retry cap is exhausted', async () => {
    const result = await decide(makeCtx({ runAttempt: 2 }), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})

describe('cloudflare worker tsc job anchor', () => {
  it('finds exactly one unconditional Cloudflare Worker compiler step', () => {
    const parsed = load(readFileSync('.github/workflows/static-code-analysis.yml', 'utf8')) as {
      jobs?: Record<string, { steps?: Array<{ run?: unknown }> }>
    }
    const owners = Object.entries(parsed.jobs ?? {}).filter(([, job]) =>
      (job.steps ?? []).some(
        step =>
          typeof step.run === 'string' &&
          step.run.split('\n')[0] ===
            'pnpm exec tsc --noEmit --project cloudflare-worker/tsconfig.json',
      ),
    )

    expect(owners.map(([jobId]) => jobId)).toEqual(['static-code-analysis'])
  })
})
