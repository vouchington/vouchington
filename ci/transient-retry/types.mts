import type { WorkflowRetryRule } from 'vouchington-tooling/transient-retry'
export type { WorkflowRunContext, WorkflowJobStep } from 'vouchington-tooling/transient-retry'

export type TransientRetryRule = WorkflowRetryRule & {
  id: string // stable slug used in logs/telemetry
  consumerKey: string // stable identity of the command/action being retried
  rootCauseKey: string // stable identity of the transient cause family
  description: string // human-readable; agents read this
  rationale: string // why this fingerprint is transient
  // GitHub Actions run IDs from the archived predecessor repository, kept for audit provenance.
  // That repository is private, so no URL is rendered — only the numeric id survives.
  exampleRunIds?: string[]
  /** Omitted means 'rerun'. */
  maxAttempts: number // reruns use retryAttempts; other decisions use the shared retryAttempt
  needsLogs?: boolean // declare true if match() calls failedJobLogs() or jobLogs()
  needsAnnotations?: boolean // declare true if match() calls failedJobAnnotations(jobName)
}
