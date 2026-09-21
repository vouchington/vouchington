import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

// Forward guard, not a positive retry fixture: a bare GitHub job-timeout signature
// cannot distinguish a no-mistakes stall from a real code deadlock or another silent
// failure. Hosted runners isolate PR jobs, but a timeout within one job is still
// inconclusive. Never auto-rerun solely on this signature.
//
// These four production job shapes use no-mistakes with disabled execution and lock-wait
// deadlines. Each ceiling comes from its live workflow so a timeout retune cannot
// silently leave this counterfixture testing an obsolete number.
//
// `CI`'s `test-playwright` calling job (ci.yml) and `Main CI (web)`'s `playwright-tests`
// calling job (main-web.yml) both `uses: ./.github/workflows/tests-playwright.yml`, whose
// `select` job runs the identical `node ci/playwright/ci-select.mts` command under the same
// workflow-owned timeout ceiling — but they surface under different check-run names
// (`test-playwright / select` vs. `playwright-tests / select`) and different `workflowName`s
// (`CI` vs. `Main CI (web)`). Both are pinned so a future rule keyed on `workflowName ===
// 'CI'` can't slip past this guard by only being tested against the other calling path.

const staticAnalysisJobName = 'static-code-analysis / no-mistakes-owned'
const selectVitestJobName = 'select-ci'
const playwrightSelectJobName = 'playwright-tests / select'
const testPlaywrightSelectJobName = 'test-playwright / select'

function jobTimeout(workflowPath: string, jobName: string): number {
  const workflow = load(readFileSync(workflowPath, 'utf8')) as {
    jobs?: Record<string, { 'timeout-minutes'?: unknown }>
  }
  const timeout = workflow.jobs?.[jobName]?.['timeout-minutes']
  if (typeof timeout !== 'number' || !Number.isInteger(timeout) || timeout <= 0)
    throw new Error(`${workflowPath}#${jobName} needs a positive integer timeout-minutes`)
  return timeout
}

function jobTimeoutCeilingLog(runCommand: string, minutes: number): string {
  return [
    `##[group]Run ${runCommand}`,
    runCommand,
    'shell: /usr/bin/bash -e {0}',
    '##[endgroup]',
    `The job running on runner github-hosted-1 has exceeded the maximum execution time of ${minutes} minutes.`,
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

describe('no-mistakes-job-timeout-ceiling-inconclusive (forward guard, no rule yet)', () => {
  it('falls through to dispatch when the static-analysis no-mistakes step is killed at the job timeout ceiling', async () => {
    const log = jobTimeoutCeilingLog(
      'pnpm exec no-mistakes --timeout 0 --lock-timeout 0 check --tsconfig tsconfig.json',
      jobTimeout('.github/workflows/static-code-analysis.yml', 'no-mistakes-owned'),
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
    const log = jobTimeoutCeilingLog(
      'node ci/vitest/ci-select.mts',
      jobTimeout('.github/workflows/ci-select-vitest.yml', 'select-ci'),
    )
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
    const log = jobTimeoutCeilingLog(
      'node ci/playwright/ci-select.mts',
      jobTimeout('.github/workflows/tests-playwright.yml', 'select'),
    )
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
    const log = jobTimeoutCeilingLog(
      'node ci/playwright/ci-select.mts',
      jobTimeout('.github/workflows/tests-playwright.yml', 'select'),
    )
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
