import { readdirSync, readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'
import {
  ciCloudflareWorkerStaticJobName,
  mainCloudflareWorkerStaticJobName,
} from './static-analysis-rules.mts'

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
  failedJobNames: [ciCloudflareWorkerStaticJobName, 'tests-processing / tests-processing', 'tests'],
  failedJobLogs: () =>
    Promise.resolve(new Map([[ciCloudflareWorkerStaticJobName, cloudflareWorkerCrashLog]])),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('cloudflare-worker-tsc-runtime-unknown-caller-pc', () => {
  it('matches the CI static-cloudflare job that runs the Cloudflare Worker tsc step', async () => {
    const result = await decide(makeCtx(), RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('cloudflare-worker-tsc-runtime-unknown-caller-pc')
  })

  it('matches the Main CI cloudflare-worker static-cloudflare job', async () => {
    const result = await decide(
      makeCtx({
        workflowName: 'Main CI (cloudflare-worker)',
        failedJobNames: [mainCloudflareWorkerStaticJobName],
        failedJobLogs: () =>
          Promise.resolve(new Map([[mainCloudflareWorkerStaticJobName, cloudflareWorkerCrashLog]])),
      }),
      RULES,
    )
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('cloudflare-worker-tsc-runtime-unknown-caller-pc')
  })

  it('does not hide an independent reusable Patch Coverage failure', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [
          ciCloudflareWorkerStaticJobName,
          'Patch Coverage / Patch Coverage',
          'tests-processing / tests-processing',
          'tests',
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
              ciCloudflareWorkerStaticJobName,
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
              ciCloudflareWorkerStaticJobName,
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
      makeCtx({ failedJobNames: [ciCloudflareWorkerStaticJobName, 'test-web'] }),
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

  it('does not match the same crash when it is only on static-code-analysis / static-code-analysis', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [staticAnalysisJobName, 'tests-processing / tests-processing', 'tests'],
        failedJobLogs: () =>
          Promise.resolve(new Map([[staticAnalysisJobName, cloudflareWorkerCrashLog]])),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})

describe('cloudflare worker tsc job anchor', () => {
  interface YamlJob {
    uses?: unknown
    with?: Record<string, unknown>
    steps?: Array<{ run?: unknown }>
  }
  interface YamlWorkflow {
    jobs?: Record<string, YamlJob>
  }

  function calledStaticCloudflareJobId(): string {
    const parsed = load(readFileSync('.github/workflows/checks-static.yml', 'utf8')) as YamlWorkflow
    const jobIds = Object.entries(parsed.jobs ?? {})
      .filter(([, job]) =>
        (job.steps ?? []).some(
          step =>
            typeof step.run === 'string' &&
            step.run.split('\n')[0] ===
              'pnpm exec tsc --noEmit --project cloudflare-worker/tsconfig.json',
        ),
      )
      .map(([jobId]) => jobId)
    expect(jobIds).toHaveLength(1)
    const [jobId] = jobIds
    if (jobId === undefined) throw new Error('checks-static.yml has no Cloudflare Worker tsc job')
    return jobId
  }

  function cloudflareStaticCallerJobIds(workflowPath: string): string[] {
    const parsed = load(readFileSync(workflowPath, 'utf8')) as YamlWorkflow
    return Object.entries(parsed.jobs ?? {})
      .filter(
        ([, job]) =>
          job.uses === './.github/workflows/checks-static.yml' &&
          job.with?.['cloudflare-worker'] === true,
      )
      .map(([jobId]) => jobId)
  }

  it('follows every checks-static.yml caller that enables the Cloudflare Worker tsc job', () => {
    const calledJobId = calledStaticCloudflareJobId()
    const composed = readdirSync('.github/workflows')
      .filter(name => name.endsWith('.yml'))
      .flatMap(name => cloudflareStaticCallerJobIds(`.github/workflows/${name}`))
      .map(callerJobId => `${callerJobId} / ${calledJobId}`)

    expect(new Set(composed)).toEqual(
      new Set([ciCloudflareWorkerStaticJobName, mainCloudflareWorkerStaticJobName]),
    )
  })
})
