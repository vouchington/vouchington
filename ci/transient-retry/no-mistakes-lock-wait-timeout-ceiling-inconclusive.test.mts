import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

// Forward-guard fixture, not a positive test (see README.md's "Known Inconclusive
// Fingerprints" section and docs/development/ci.md's Static Analysis section).
//
// PR #8470 disabled no-mistakes' execution deadline and lock-wait deadline for every
// production CI invocation (`--timeout 0 --lock-timeout 0`), so concurrent invocations
// now serialize on a shared machine-wide lock instead of failing fast with exit 124 —
// which is why the old `static-analysis-no-mistakes-lock-wait-timeout` rule (keyed on
// that exit-124 fingerprint) was deleted: no current CI command can produce it anymore.
//
// That mitigation shifted the failure mode rather than removing it. The upstream
// lock-acquire loop polls every 50ms with zero progress output while blocked
// (no-mistakes crates/no-mistakes/src/invocation/lock.rs), so a job silently SIGKILLed
// by GitHub at its own `timeout-minutes` ceiling while blocked on that lock is
// byte-for-byte indistinguishable in the log from a job silently hung for any other
// reason — a real code-bug deadlock in a sibling static-analysis tool (oxlint, ast-grep,
// knip, ...) would produce the exact same trailing shape. Per README.md's "Don't
// generalize timeouts for heterogeneous jobs" invariant, no rule may match on the bare
// job-timeout-ceiling signature alone, so this deliberately has no rule and falls
// through to Harness — surfacing the failure loudly instead of silently swallowing it.
//
// This test pins the four real production job shapes that share the disabled lock-wait
// deadline (the static-analysis no-mistakes step, the Vitest selector step, and both
// Playwright selector steps) and asserts `decide()` falls through to dispatch today. A future
// rule author must prove their fingerprint does not also match one of these before this
// test may go red.
//
// `CI`'s `test-playwright` calling job (ci.yml) and `Main CI (web)`'s `playwright-tests`
// calling job (main-web.yml) both `uses: ./.github/workflows/tests-playwright.yml`, whose
// `select` job runs the identical `node ci/playwright/ci-select.mts` command under the same
// `timeout-minutes: 5` ceiling — but they surface under different check-run names
// (`test-playwright / select` vs. `playwright-tests / select`) and different `workflowName`s
// (`CI` vs. `Main CI (web)`). Both are pinned so a future rule keyed on `workflowName ===
// 'CI'` can't slip past this guard by only being tested against the other calling path.

const staticAnalysisJobName = 'static-code-analysis / static-code-analysis'
const selectVitestJobName = 'select-ci'
const playwrightSelectJobName = 'playwright-tests / select'
const testPlaywrightSelectJobName = 'test-playwright / select'

function jobTimeoutCeilingLog(runCommand: string, minutes: number): string {
  return [
    `##[group]Run ${runCommand}`,
    runCommand,
    'shell: /usr/bin/bash -e {0}',
    '##[endgroup]',
    `The job running on runner self-hosted-1 has exceeded the maximum execution time of ${minutes} minutes.`,
    'Error: The operation was canceled.',
  ].join('\n')
}

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'timed_out',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('no-mistakes-lock-wait-timeout-ceiling-inconclusive (forward guard, no rule yet)', () => {
  it('falls through to dispatch when the static-analysis no-mistakes step is killed at the job timeout ceiling', async () => {
    const log = jobTimeoutCeilingLog(
      'pnpm exec no-mistakes --timeout 0 --lock-timeout 0 check --tsconfig tsconfig.json',
      35,
    )
    const result = await decide(
      makeCtx({
        failedJobNames: [staticAnalysisJobName],
        failedJobLogs: () => Promise.resolve(new Map([[staticAnalysisJobName, log]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('falls through to dispatch when the CI select-ci step is killed at the job timeout ceiling', async () => {
    const log = jobTimeoutCeilingLog('node ci/vitest/ci-select.mts', 5)
    const result = await decide(
      makeCtx({
        failedJobNames: [selectVitestJobName],
        failedJobLogs: () => Promise.resolve(new Map([[selectVitestJobName, log]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('falls through to dispatch when the Main CI (web) Playwright select step is killed at the job timeout ceiling', async () => {
    const log = jobTimeoutCeilingLog('node ci/playwright/ci-select.mts', 5)
    const result = await decide(
      makeCtx({
        workflowName: 'Main CI (web)',
        failedJobNames: [playwrightSelectJobName],
        failedJobLogs: () => Promise.resolve(new Map([[playwrightSelectJobName, log]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('falls through to dispatch when the CI test-playwright select step is killed at the job timeout ceiling', async () => {
    const log = jobTimeoutCeilingLog('node ci/playwright/ci-select.mts', 5)
    const result = await decide(
      makeCtx({
        failedJobNames: [testPlaywrightSelectJobName],
        failedJobLogs: () => Promise.resolve(new Map([[testPlaywrightSelectJobName, log]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
