import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

function makeCtx(overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext {
  return {
    workflowName: 'CI',
    conclusion: 'failure',
    runAttempt: 1,
    failedJobNames: [],
    jobConclusions: new Map(),
    failedJobLogs: () => Promise.resolve(new Map()),
    failedJobAnnotations: () => Promise.resolve([]),
    ...overrides,
  }
}

function flatHookPathAdmissionLog(freeGiB = 34, requiredGiB = 35): string {
  return [
    'A job started hook has been configured by the self-hosted runner administrator',
    "Run '/Users/jonathanong/.local/share/voucha-actions-runner-health/job-started.sh'",
    `Runner disk admission rejected: free=${freeGiB}GiB required=${requiredGiB}GiB active_leases=2`,
    '##[error]Process completed with exit code 1.',
  ].join('\n')
}

// Observed verbatim (job-name and path elided) on run 33277938591, job 99168024109
// ("Find related open PRs or issues", host Jonathans-Mac-mini-1, 2026-08-29). The host tooling
// moved the hook behind a versioned/symlinked `current/` directory; #10416 was filed because this
// exact log never reached a rule (fix-main.yml never classifies its own related-candidates job),
// but the stale literal-path check here was a real, independent regression this run also exposed.
const realCurrentPathAdmissionLog = [
  'A job started hook has been configured by the self-hosted runner administrator',
  "##[group]Run '/Users/jonathanong/.local/share/voucha-actions-runner-health/current/job-started.sh'",
  'shell: /bin/bash --noprofile --norc -e -o pipefail {0}',
  '##[endgroup]',
  'Removed generated build outputs: files=0 directories=0 bytes=0',
  'Runner disk admission waiting: free=3GiB required=5GiB active_leases=1 remaining=120s',
  'Runner disk admission waiting: free=3GiB required=5GiB active_leases=1 remaining=90s',
  'Runner disk admission waiting: free=3GiB required=5GiB active_leases=1 remaining=60s',
  'Runner disk admission waiting: free=3GiB required=5GiB active_leases=1 remaining=30s',
  'Runner disk admission rejected: free=3GiB required=5GiB active_leases=1 waited=121s',
  '##[error]Process completed with exit code 1.',
].join('\n')

describe('runner-disk-admission-rejected (job-started.sh path variants)', () => {
  it('reruns the real observed current/job-started.sh admission rejection (run 33277938591)', async () => {
    const jobName = 'related-candidates'
    const result = await decide(
      makeCtx({
        failedJobNames: [jobName],
        jobConclusions: new Map([[jobName, 'failure']]),
        failedJobLogs: () => Promise.resolve(new Map([[jobName, realCurrentPathAdmissionLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-disk-admission-rejected')
  })

  it('still reruns the older flat, unversioned job-started.sh hook path', async () => {
    const jobName = 'actionlint'
    const result = await decide(
      makeCtx({
        failedJobNames: [jobName],
        jobConclusions: new Map([[jobName, 'failure']]),
        failedJobLogs: () => Promise.resolve(new Map([[jobName, flatHookPathAdmissionLog()]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-disk-admission-rejected')
  })
})
