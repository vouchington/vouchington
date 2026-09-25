import { deriveRuleAttempt, parseWorkflowJobEntries, type JobEntry } from './attempts.mts'
import { decide } from './decision-evaluator.mts'
import { ghApi, LOG_MAX_BUFFER_BYTES, type GhApiExecFile } from './gh-api.mts'
import { annotationMessagesFromPages } from './run-context-annotations.mts'
import { createLogFetchers } from './run-context-logs.mts'
import type { TransientRetryRule, WorkflowJobConclusion, WorkflowRunContext } from './types.mts'

interface DeriveRuleAttemptsOptions {
  execFile: GhApiExecFile
  priorAttemptJobCounts: number[]
  repository: string
  rules: TransientRetryRule[]
  runAttempt: number
  runId: string
  sleep?: (ms: number) => Promise<void>
  workflowName: string
}

const failedConclusions = ['failure', 'timed_out', 'cancelled'] as const

class ReplayEvidenceUnavailableError extends Error {
  readonly ruleIndex: number

  constructor(ruleId: string, ruleIndex: number) {
    super(`Cannot replay rule ${ruleId}: required prior-attempt evidence is unavailable`)
    this.ruleIndex = ruleIndex
  }
}

function isFailedWorkflowConclusion(
  conclusion: string | null | undefined,
): conclusion is WorkflowRunContext['conclusion'] {
  return failedConclusions.some(failedConclusion => failedConclusion === conclusion)
}

function failedConclusionFromJobs(jobEntries: JobEntry[]): WorkflowRunContext['conclusion'] {
  if (jobEntries.some(job => job.conclusion === 'failure')) return 'failure'
  if (jobEntries.some(job => job.conclusion === 'timed_out')) return 'timed_out'
  return 'cancelled'
}

async function buildAttemptContext({
  attempt,
  execFile,
  priorAttemptJobCounts,
  repository,
  runId,
  sleep,
  workflowName,
}: DeriveRuleAttemptsOptions & { attempt: number }): Promise<WorkflowRunContext> {
  const jobsResult = await ghApi(
    [`repos/${repository}/actions/runs/${runId}/attempts/${attempt}/jobs`, '--paginate', '--slurp'],
    { execFile, maxBuffer: LOG_MAX_BUFFER_BYTES, sleep },
  )
  const allJobEntries = parseWorkflowJobEntries(jobsResult.stdout)
  const rawJobEntries = allJobEntries.filter(job => isFailedWorkflowConclusion(job.conclusion))
  const { failedJobLogs, failedJobLogFetchFailures, jobLogs } = createLogFetchers({
    allJobEntries,
    execFile,
    rawJobEntries,
    repository,
    sleep,
  })
  const cachedAnnotations = new Map<string, string[]>()
  const annotationFetchFailures = new Set<string>()
  const failedJobAnnotations = async (jobName: string): Promise<string[]> => {
    const cached = cachedAnnotations.get(jobName)
    if (cached !== undefined) return cached

    const job = rawJobEntries.find(entry => entry.name === jobName)
    if (!job) {
      cachedAnnotations.set(jobName, [])
      return []
    }

    try {
      const result = await ghApi(
        [
          '-X',
          'GET',
          `repos/${repository}/check-runs/${job.id}/annotations`,
          '-F',
          'per_page=100',
          '--paginate',
          '--slurp',
        ],
        { execFile, maxBuffer: LOG_MAX_BUFFER_BYTES, sleep },
      )
      const messages = annotationMessagesFromPages(result.stdout)
      cachedAnnotations.set(jobName, messages)
      return messages
    } catch {
      annotationFetchFailures.add(jobName)
      cachedAnnotations.set(jobName, [])
      return []
    }
  }
  const failedJobAnnotationFetchFailures = async (): Promise<Set<string>> =>
    new Set(annotationFetchFailures)

  return {
    workflowName,
    conclusion: failedConclusionFromJobs(rawJobEntries),
    runAttempt: attempt,
    ruleAttempt: deriveRuleAttempt(attempt, priorAttemptJobCounts.slice(0, attempt - 1)),
    jobNames: allJobEntries.map(job => job.name),
    jobConclusions: new Map<string, WorkflowJobConclusion>(
      allJobEntries.map(job => [job.name, job.conclusion]),
    ),
    jobSteps: new Map(allJobEntries.map(job => [job.name, job.steps ?? []])),
    failedJobNames: rawJobEntries.map(job => job.name),
    failedJobLogs,
    failedJobLogFetchFailures,
    jobLogs,
    failedJobAnnotations,
    failedJobAnnotationFetchFailures,
  }
}

async function throwIfReplayEvidenceFailed(
  ctx: WorkflowRunContext,
  rule: TransientRetryRule,
  ruleIndex: number,
): Promise<void> {
  if ((await ctx.failedJobLogFetchFailures?.())?.size) {
    throw new ReplayEvidenceUnavailableError(rule.id, ruleIndex)
  }
  if ((await ctx.failedJobAnnotationFetchFailures?.())?.size) {
    throw new ReplayEvidenceUnavailableError(rule.id, ruleIndex)
  }
}

export async function deriveRuleAttempts(
  options: DeriveRuleAttemptsOptions,
): Promise<Map<string, number>> {
  const priorReruns = new Map<string, number>()
  let replayRuleCount = options.rules.length
  for (let attempt = 1; attempt < options.runAttempt; attempt += 1) {
    const ctx = await buildAttemptContext({ ...options, attempt })
    const replayRules = options.rules.slice(0, replayRuleCount)
    ctx.ruleAttempts = new Map(
      replayRules.map(rule => [rule.id, (priorReruns.get(rule.id) ?? 0) + 1]),
    )
    let result: Awaited<ReturnType<typeof decide>>
    try {
      result = await decide(ctx, replayRules, {
        afterRuleEvaluated: (replayCtx, rule) =>
          throwIfReplayEvidenceFailed(replayCtx, rule, replayRules.indexOf(rule)),
      })
    } catch (error) {
      if (!(error instanceof ReplayEvidenceUnavailableError)) throw error
      if (error.ruleIndex === 0) throw error
      replayRuleCount = Math.min(replayRuleCount, error.ruleIndex)
      continue
    }
    if (result.decision === 'rerun') {
      priorReruns.set(result.matchedRule, (priorReruns.get(result.matchedRule) ?? 0) + 1)
    }
  }

  return new Map(
    options.rules
      .slice(0, replayRuleCount)
      .map(rule => [rule.id, (priorReruns.get(rule.id) ?? 0) + 1]),
  )
}
