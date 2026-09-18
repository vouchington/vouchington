import { CI_AGGREGATE_FAN_IN_JOB_NAMES, isAggregateFanInCascade } from './ci-aggregate-jobs.mts'
import type { TransientRetryRule, WorkflowRunContext } from './types.mts'

const diskAdmissionRejection =
  /Runner disk admission rejected: free=(\d+)GiB required=(\d+)GiB active_leases=\d+/

// The host repository installs the hook behind a versioned/symlinked `current/` directory
// (e.g. `voucha-actions-runner-health/current/job-started.sh`) as well as flat, unversioned
// layouts observed historically. Tolerate any single interposed path segment so classification
// does not silently regress the next time the host install layout changes.
const jobStartedHookPath = /voucha-actions-runner-health\/(?:[^/\s]+\/)?job-started\.sh/

function hasDiskAdmissionRejection(log: string): boolean {
  const match = diskAdmissionRejection.exec(log)
  if (match === null) return false

  const freeGiB = Number(match[1])
  const requiredGiB = Number(match[2])
  return (
    freeGiB < requiredGiB && jobStartedHookPath.test(log) && !log.includes('Run actions/checkout@')
  )
}

function failedJobNames(ctx: WorkflowRunContext): string[] | null {
  if (ctx.jobConclusions === undefined) return null

  const failures: string[] = []
  for (const name of ctx.failedJobNames) {
    const conclusion = ctx.jobConclusions.get(name)
    if (conclusion === 'cancelled') continue
    if (conclusion !== 'failure') return null
    failures.push(name)
  }
  return failures
}

export const runnerDiskAdmissionRejectedRule: TransientRetryRule = {
  id: 'runner-disk-admission-rejected',
  consumerKey: 'self-hosted-runner-job-start-hook',
  rootCauseKey: 'self-hosted-runner-disk-pressure',
  description:
    'Self-hosted runner jobs fail before checkout because the host disk admission hook rejects their leases.',
  rationale:
    'The administrator hook rejects the job before checkout or repository code runs; retrying once can use a host with sufficient free space or run after active leases release disk capacity.',
  exampleRunIds: ['30489202028'],
  maxAttempts: 1,
  needsLogs: true,
  match: async ctx => {
    if (ctx.conclusion !== 'failure') return false

    const failures = failedJobNames(ctx)
    if (failures === null || failures.length === 0) return false

    const logs = await ctx.failedJobLogs()
    const leaves = failures.filter(
      name =>
        !CI_AGGREGATE_FAN_IN_JOB_NAMES.has(name) ||
        !isAggregateFanInCascade(name, logs.get(name) ?? ''),
    )
    if (leaves.length === 0) return false
    return leaves.every(name => hasDiskAdmissionRejection(logs.get(name) ?? ''))
  },
}
