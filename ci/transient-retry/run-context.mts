import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'

import {
  deriveRuleAttempt,
  fetchPriorAttemptJobCounts,
  parseWorkflowJobEntries,
} from './attempts.mts'
import { ghApi, LOG_MAX_BUFFER_BYTES, type GhApiExecFile } from './gh-api.mts'
import { annotationMessagesFromPages } from './run-context-annotations.mts'
import { createLogFetchers } from './run-context-logs.mts'
import { deriveRuleAttempts } from './run-context-rule-attempts.mts'
import type { TransientRetryRule, WorkflowRunContext } from './types.mts'

const execFile = promisify(execFileCb) as GhApiExecFile

const FAILED_CONCLUSIONS = ['failure', 'timed_out', 'cancelled'] as const

export function isFailedWorkflowConclusion(
  conclusion: string | null | undefined,
): conclusion is WorkflowRunContext['conclusion'] {
  return FAILED_CONCLUSIONS.some(failedConclusion => failedConclusion === conclusion)
}

export interface WorkflowRunSummary {
  conclusion: string | null | undefined
  runAttempt: number
  workflowName: string
}

interface SharedRunOptions {
  execFile?: GhApiExecFile
  repository: string
  runId: string
  sleep?: (ms: number) => Promise<void>
}

export async function fetchWorkflowRunSummary({
  execFile: ghApiExecFile = execFile,
  repository,
  runId,
  sleep,
}: SharedRunOptions): Promise<WorkflowRunSummary> {
  const result = await ghApi([`repos/${repository}/actions/runs/${runId}`], {
    execFile: ghApiExecFile,
    maxBuffer: LOG_MAX_BUFFER_BYTES,
    sleep,
  })
  const parsedRun = JSON.parse(result.stdout.trim()) as unknown
  if (typeof parsedRun !== 'object' || parsedRun === null) {
    throw new Error(`Invalid workflow run response in GitHub API response for run ${runId}`)
  }

  const run = parsedRun as {
    conclusion?: unknown
    name?: unknown
    run_attempt?: unknown
  }
  const runAttempt = typeof run.run_attempt === 'number' ? run.run_attempt : NaN
  if (!Number.isFinite(runAttempt) || runAttempt < 1) {
    throw new Error(`Invalid workflow run attempt in GitHub API response for run ${runId}`)
  }
  if (typeof run.name !== 'string' || run.name.length === 0) {
    throw new Error(`Invalid workflow run name in GitHub API response for run ${runId}`)
  }
  if (run.conclusion != null && typeof run.conclusion !== 'string') {
    throw new Error(`Invalid workflow run conclusion in GitHub API response for run ${runId}`)
  }

  return {
    conclusion: run.conclusion,
    runAttempt,
    workflowName: run.name,
  }
}

function hasOnlyKnownJobCounts(jobCounts: Array<number | null>): jobCounts is number[] {
  return jobCounts.every((count): count is number => count !== null)
}

export interface BuildWorkflowRunContextOptions extends SharedRunOptions {
  conclusion: WorkflowRunContext['conclusion']
  rules?: TransientRetryRule[]
  runAttempt: number
  workflowName: string
}

export async function buildWorkflowRunContext({
  conclusion,
  execFile: ghApiExecFile = execFile,
  repository,
  rules,
  runAttempt,
  runId,
  sleep,
  workflowName,
}: BuildWorkflowRunContextOptions): Promise<WorkflowRunContext> {
  const priorAttemptJobCounts = await fetchPriorAttemptJobCounts({
    execFile: ghApiExecFile,
    repository,
    runAttempt,
    runId,
    sleep,
  })
  const ruleAttempt = hasOnlyKnownJobCounts(priorAttemptJobCounts)
    ? deriveRuleAttempt(runAttempt, priorAttemptJobCounts)
    : runAttempt

  const jobsResult = await ghApi(
    [`repos/${repository}/actions/runs/${runId}/jobs`, '--paginate', '--slurp'],
    { execFile: ghApiExecFile, maxBuffer: LOG_MAX_BUFFER_BYTES, sleep },
  )

  const allJobEntries = parseWorkflowJobEntries(jobsResult.stdout)
  const rawJobEntries = allJobEntries.filter(job => isFailedWorkflowConclusion(job.conclusion))
  const failedJobNames = rawJobEntries.map(job => job.name)
  const jobConclusions = new Map(allJobEntries.map(job => [job.name, job.conclusion]))
  const jobIds = new Map(allJobEntries.map(job => [job.name, job.id]))
  const jobSteps = new Map(allJobEntries.map(job => [job.name, job.steps ?? []]))

  const { failedJobLogs, failedJobLogFetchFailures, jobLogs } = createLogFetchers({
    allJobEntries,
    execFile: ghApiExecFile,
    rawJobEntries,
    repository,
    sleep,
    streamLogs: ghApiExecFile === execFile,
  })

  const cachedAnnotations = new Map<string, string[]>()
  const annotationFetchFailures = new Set<string>()
  const failedJobAnnotations = async (jobName: string): Promise<string[]> => {
    const cached = cachedAnnotations.get(jobName)
    if (cached !== undefined) return cached

    const job = rawJobEntries.find(entry => entry.name === jobName)
    if (job === undefined) {
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
        { execFile: ghApiExecFile, maxBuffer: LOG_MAX_BUFFER_BYTES, sleep },
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

  const ruleAttempts =
    rules && hasOnlyKnownJobCounts(priorAttemptJobCounts)
      ? await deriveRuleAttempts({
          execFile: ghApiExecFile,
          priorAttemptJobCounts,
          repository,
          rules,
          runAttempt,
          runId,
          sleep,
          workflowName,
        }).catch(() => undefined)
      : undefined

  return {
    workflowName,
    conclusion,
    runAttempt,
    ruleAttempt,
    ruleAttempts,
    jobNames: allJobEntries.map(job => job.name),
    jobConclusions,
    jobIds,
    jobSteps,
    failedJobNames,
    failedJobLogs,
    failedJobLogFetchFailures,
    jobLogs,
    failedJobAnnotations,
    failedJobAnnotationFetchFailures,
  }
}
