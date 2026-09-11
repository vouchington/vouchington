export type WorkflowJobConclusion = string | undefined

export interface WorkflowJobStep {
  conclusion?: string | null
  name: string
  number?: number
  started_at?: string | null
  status?: string
}

export interface WorkflowRunContext {
  workflowName: string
  conclusion: 'failure' | 'timed_out' | 'cancelled'
  runAttempt: number
  /**
   * Attempt count used for rule maxAttempts after discounting prior attempts that
   * GitHub counted but that created no jobs and therefore had no failure signal.
   */
  ruleAttempt?: number
  /**
   * Each rerun rule's current next-occurrence count, reconstructed by replaying prior
   * attempts chronologically and incrementing only the rule whose rerun decision won.
   * When present, this overrides the shared ruleAttempt for that rerun rule.
   */
  ruleAttempts?: Map<string, number>
  /** All jobs GitHub created for the run; absent in direct unit fixtures that do not need it. */
  jobNames?: string[]
  /** GitHub conclusion per created job, keyed by exact job name when available. */
  jobConclusions?: Map<string, WorkflowJobConclusion>
  /** GitHub database id per created job, keyed by exact job name when available. */
  jobIds?: Map<string, number>
  /** GitHub step state per created job, keyed by exact job name when available. */
  jobSteps?: Map<string, WorkflowJobStep[]>
  failedJobNames: string[]
  /** Lazily-fetched log text per job name; log-reading rules opt in with needsLogs: true */
  failedJobLogs: () => Promise<Map<string, string>>
  /** Failed job names whose logs could not be fetched. */
  failedJobLogFetchFailures?: () => Promise<Set<string>>
  /** Lazily-fetched log text for explicitly named jobs, including successful jobs */
  jobLogs?: (jobNames: string[]) => Promise<Map<string, string>>
  /** Lazily-fetched check-run annotation messages for a specific job name */
  failedJobAnnotations: (jobName: string) => Promise<string[]>
  /** Failed job names whose annotations could not be fetched. */
  failedJobAnnotationFetchFailures?: () => Promise<Set<string>>
}

interface TransientRetryRuleBase {
  id: string // stable slug used in logs/telemetry
  consumerKey: string // stable identity of the command/action being retried
  rootCauseKey: string // stable identity of the transient cause family
  description: string // human-readable; agents read this
  rationale: string // why this fingerprint is transient
  exampleRunUrls?: string[]
  maxAttempts: number // reruns use ruleAttempts; other decisions use the shared ruleAttempt
  needsLogs?: boolean // declare true if match() calls failedJobLogs() or jobLogs()
  needsAnnotations?: boolean // declare true if match() calls failedJobAnnotations(jobName)
  match: (ctx: WorkflowRunContext) => boolean | Promise<boolean>
}

export type RerunTarget =
  | { jobName: string; jobNameFamily?: never; resolveJobName?: never }
  | {
      jobName?: never
      /** Static prefix shared by every dynamically-named job in the family (e.g. matrix shards). */
      jobNameFamily: string
      /** Resolves the exact job name for this run, or null if it cannot be determined. */
      resolveJobName: (ctx: WorkflowRunContext) => string | null
    }

type RerunTransientRetryRule = TransientRetryRuleBase & {
  decision?: 'rerun'
  /** Restrict a rerun decision to one exact GitHub job, or one resolved from a job-name family. */
  rerunTarget?: RerunTarget
}

type NonRerunTransientRetryRule = TransientRetryRuleBase & {
  decision: 'ignore'
  rerunTarget?: never
}

export type TransientRetryRule = RerunTransientRetryRule | NonRerunTransientRetryRule
