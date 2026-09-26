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
// The static-analysis job runs no-mistakes with disabled execution and lock-wait deadlines. Its
// ceiling comes from the live workflow so a timeout retune cannot silently leave this
// counterfixture testing an obsolete number.

const staticAnalysisJobName = 'static-code-analysis / no-mistakes'

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
      jobTimeout('.github/workflows/static-code-analysis.yml', 'no-mistakes'),
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
})
