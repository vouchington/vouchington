import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const buildWebTargetsJobName = 'playwright-tests / playwright-tests (4)'
const staticWebJobName = 'static-checks / static-web'
const sigkillSurvivorMarker =
  'with-host-lock: expensive-build process group survived SIGKILL; retaining lock ownership'
const commandTimeoutMarker =
  'with-host-lock: expensive-build command exceeded 300s; terminating its process group'

// Derived from vouchington-tooling 0.10.0's with-host-lock.sh and current callers, not an
// observed CI run. A process group that survives SIGKILL retains lock ownership and exits 1.
const buildWebTargetsSurvivorLog = [
  '##[group]Run ./.github/actions/build-web-targets',
  '▲ Next.js 16.3.4 (Turbopack)',
  '  Creating an optimized production build ...',
  commandTimeoutMarker,
  sigkillSurvivorMarker,
  'Error: pnpm --dir web build failed with exit code 1',
  '##[error]Process completed with exit code 1.',
].join('\n')
// static-web now runs the identical composite script as build-web-targets, so its survivor log is
// the same shape — only the job name differs.
const staticWebSurvivorLog = buildWebTargetsSurvivorLog

const makeCtx = (jobName: string, log: string): WorkflowRunContext => ({
  workflowName: 'Main CI (web)',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [jobName],
  failedJobLogs: () => Promise.resolve(new Map([[jobName, log]])),
  failedJobAnnotations: () => Promise.resolve([]),
})

const survivorCases = [
  {
    jobName: buildWebTargetsJobName,
    log: buildWebTargetsSurvivorLog,
    ruleId: 'main-web-build-web-targets-watchdog-timeout',
  },
  {
    jobName: staticWebJobName,
    log: staticWebSurvivorLog,
    ruleId: 'main-web-static-build-watchdog-timeout',
  },
]

describe('web-build watchdog SIGKILL-survivor terminals', () => {
  it('does not rerun the static survivor terminal without an emitted command-timeout marker', async () => {
    const result = await decide(
      makeCtx(staticWebJobName, staticWebSurvivorLog.replace(`${commandTimeoutMarker}\n`, '')),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
  })

  it('does not rerun survivor terminals from echoed command-timeout source lines', async () => {
    for (const testCase of survivorCases) {
      const log = testCase.log.replace(commandTimeoutMarker, `echo "${commandTimeoutMarker}"`)
      const result = await decide(makeCtx(testCase.jobName, log), RULES)
      expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
    }
  })

  it.each(survivorCases)('reruns the source-derived exit-1 $ruleId variant', async testCase => {
    const result = await decide(makeCtx(testCase.jobName, testCase.log), RULES)
    expect(`${result.decision}:${result.matchedRule}`).toBe(`rerun:${testCase.ruleId}`)
  })

  it.each(survivorCases)(
    'does not rerun $ruleId without the emitted SIGKILL-survivor marker',
    async testCase => {
      const log = testCase.log.replace(`${sigkillSurvivorMarker}\n`, '')
      const result = await decide(makeCtx(testCase.jobName, log), RULES)
      expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
    },
  )

  it.each(survivorCases)(
    'does not rerun $ruleId from an echoed SIGKILL-survivor source line',
    async testCase => {
      const log = testCase.log.replace(sigkillSurvivorMarker, `echo "${sigkillSurvivorMarker}"`)
      const result = await decide(makeCtx(testCase.jobName, log), RULES)
      expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
    },
  )

  it.each(survivorCases)('does not rerun $ruleId with compiler or OOM evidence', async testCase => {
    for (const log of [
      `${testCase.log}\nFailed to compile`,
      `${testCase.log}\nOut of memory: Killed process 1491514 (next-build (v16)`,
    ]) {
      const result = await decide(makeCtx(testCase.jobName, log), RULES)
      expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
    }
  })
})
