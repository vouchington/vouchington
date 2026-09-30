import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const staticAnalysisJobName = 'static-code-analysis / static-code-analysis'

// #8754 (2026-07-29) wrapped this step in ci/with-heavy-slot.sh. The current oxlint-tsgolint Go
// binary is built with -trimpath, so its traceback carries the stable
// `github.com/microsoft/typescript-go/internal/...` import path on both the symbol and file line,
// never the older vendored-checkout path
// (`/home/runner/work/tsgolint/tsgolint/typescript-go/internal/...`) — see
// oxlintTsgolintVendoredCheckoutShapeLog below for that old shape as a counterfixture. The
// `+ oxlint-tsgolint` version in every fixture is synthetic: the fingerprint keys on the traceback
// shape, never on the tool version.
const oxlintTsgolintFaultLog = [
  '##[group]Run pnpm exec oxlint --type-aware --deny-warnings',
  'pnpm exec oxlint --type-aware --deny-warnings',
  '+ oxlint-tsgolint 0.0.0',
  'unexpected fault address 0x6f6a2f73726573c5',
  'fatal error: fault',
  'github.com/microsoft/typescript-go/internal/binder.(*Binder).bindSourceFile(0x6f6a2f73726573c5)',
  '\tgithub.com/microsoft/typescript-go/internal/binder/binder.go:1755 +0x1a5',
  'Error running tsgolint: "exit status: 2"',
  '##[error]Process completed with exit code 1.',
].join('\n')

const oxlintTsgolintParserFaultLog = [
  '##[group]Run pnpm exec oxlint --type-aware --deny-warnings',
  'pnpm exec oxlint --type-aware --deny-warnings',
  '+ oxlint-tsgolint 0.0.0',
  'unexpected fault address 0x6e6f6974636134a7',
  'fatal error: fault',
  'github.com/microsoft/typescript-go/internal/parser.(*Parser).parseFunctionBlock(0x6e6f697463612f67)',
  '\tgithub.com/microsoft/typescript-go/internal/parser/parser.go:3503 +0x2b3',
  'Error running tsgolint: "exit status: 2"',
  '##[error]Process completed with exit code 1.',
].join('\n')

// The older vendored-checkout shape: no Go import-path symbol line, and the file line carries the
// vendored checkout path instead of the stable import path. Proves the corrected fingerprint is not
// tautological with the old-shape input it replaced.
const oxlintTsgolintVendoredCheckoutShapeLog = [
  '##[group]Run pnpm exec oxlint --type-aware --deny-warnings',
  'pnpm exec oxlint --type-aware --deny-warnings',
  '+ oxlint-tsgolint 0.0.0',
  'unexpected fault address 0x6f6a2f73726573c5',
  'fatal error: fault',
  '\t/home/runner/work/tsgolint/tsgolint/typescript-go/internal/binder/binder.go:1755',
  'Error running tsgolint: "exit status: exit status: 2"',
  '##[error]Process completed with exit code 1.',
].join('\n')

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Static',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [staticAnalysisJobName, 'static'],
  failedJobLogs: () => Promise.resolve(new Map([[staticAnalysisJobName, oxlintTsgolintFaultLog]])),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('static-analysis-oxlint-tsgolint-runtime-fault', () => {
  it('does not classify another job log as the oxlint failure', async () => {
    await expect(
      decide(
        makeCtx({
          failedJobLogs: async () =>
            new Map([
              ['static', oxlintTsgolintFaultLog],
              [staticAnalysisJobName, 'ordinary lint diagnostic'],
            ]),
        }),
        RULES,
      ),
    ).resolves.toEqual({ decision: 'dispatch', matchedRule: '' })
  })

  it('matches an oxlint tsgolint runtime fault on attempt 1', async () => {
    const result = await decide(makeCtx(), RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('static-analysis-oxlint-tsgolint-runtime-fault')
  })

  it('matches an oxlint tsgolint parser runtime fault on attempt 1', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(new Map([[staticAnalysisJobName, oxlintTsgolintParserFaultLog]])),
      }),
      RULES,
    )
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('static-analysis-oxlint-tsgolint-runtime-fault')
  })

  it('does not match ordinary oxlint failures', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                staticAnalysisJobName,
                [
                  '##[group]Run pnpm exec oxlint --type-aware --deny-warnings',
                  'pnpm exec oxlint --type-aware --deny-warnings',
                  'web/app/page.tsx:1:1 lint/suspicious/noExplicitAny',
                  '##[error]Process completed with exit code 1.',
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

  it('does not match the older vendored-checkout traceback shape', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([[staticAnalysisJobName, oxlintTsgolintVendoredCheckoutShapeLog]]),
          ),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match the same tsgolint runtime fault after the retry cap is exhausted', async () => {
    const result = await decide(makeCtx({ runAttempt: 2 }), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
