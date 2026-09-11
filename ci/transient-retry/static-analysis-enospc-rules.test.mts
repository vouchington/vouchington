import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const staticAnalysisJobName = 'static-code-analysis / static-code-analysis'

const matchingLog = [
  'static-code-analysis / static-code-analysis\tUNKNOWN STEP\t2026-07-13T02:53:26.4560890Z ##[group]Run actions/checkout@vNEXT',
  'static-code-analysis / static-code-analysis\tUNKNOWN STEP\t2026-07-13T02:53:26.9060770Z node:fs:2422',
  'static-code-analysis / static-code-analysis\tUNKNOWN STEP\t2026-07-13T02:53:26.9451710Z Error: ENOSPC: no space left on device, write',
  'static-code-analysis / static-code-analysis\tUNKNOWN STEP\t2026-07-13T02:53:26.9735000Z     at file_command_issueFileCommand (file:///Users/jonathanong/actions-runners/5/_work/_actions/actions/checkout/v7.0.0/dist/index.js:32043:33)',
  "static-code-analysis / static-code-analysis\tUNKNOWN STEP\t2026-07-13T02:53:27.0238960Z   code: 'ENOSPC',",
].join('\n')

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'cancelled',
  runAttempt: 1,
  failedJobNames: [staticAnalysisJobName, 'tests', 'build'],
  jobConclusions: new Map([
    [staticAnalysisJobName, 'failure'],
    ['tests', 'cancelled'],
    ['build', 'cancelled'],
  ]),
  failedJobLogs: () => Promise.resolve(new Map([[staticAnalysisJobName, matchingLog]])),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('static-analysis-checkout-enospc', () => {
  it('matches static-analysis checkout disk exhaustion with cancelled downstream jobs', async () => {
    const result = await decide(makeCtx(), RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('static-analysis-checkout-enospc')
  })

  it('does not match an ENOSPC string outside actions checkout', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                staticAnalysisJobName,
                [
                  'pnpm exec oxlint --type-aware --deny-warnings',
                  'Error: ENOSPC: no space left on device, write',
                  "code: 'ENOSPC'",
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

  it('does not match when another job genuinely failed', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [staticAnalysisJobName, 'test-web / web-tests (1)', 'tests', 'build'],
        jobConclusions: new Map([
          [staticAnalysisJobName, 'failure'],
          ['test-web / web-tests (1)', 'failure'],
          ['tests', 'cancelled'],
          ['build', 'cancelled'],
        ]),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
