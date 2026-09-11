import { LOG_OMISSION_MARKER } from './run-context-log-window.mts'
import {
  hasExplicitOomEvidence,
  hasGenericFailureSignal,
  hasMigrationFailureSignal,
  hasNextBuildFailureSignal,
  hasPlaywrightFailureSignal,
  hasVitestTestFailureSignal,
  hasWebStackBuildFailureSignal,
} from './runner-shutdown-fingerprints.mts'
import type { WorkflowRunContext } from './types.mts'

function hasCleanCancellationMarker(log: string): boolean {
  return (
    log.includes('##[error]The operation was canceled.') ||
    log.includes('##[error]A task was canceled.')
  )
}

function hasUnrecognizedActionsError(log: string): boolean {
  for (const line of log.split('\n')) {
    if (!line.includes('##[error]')) continue
    if (line.includes('The operation was canceled.')) continue
    if (line.includes('A task was canceled.')) continue
    if (line.includes('The runner has received a shutdown signal.')) continue
    if (/##\[error\]Process completed with exit code 143\./.test(line)) continue
    return true
  }
  return false
}

function hasDurableCancelledSiblingFailure(log: string): boolean {
  return (
    hasGenericFailureSignal(log) ||
    hasExplicitOomEvidence(log) ||
    hasPlaywrightFailureSignal(log) ||
    hasVitestTestFailureSignal(log) ||
    hasNextBuildFailureSignal(log) ||
    hasWebStackBuildFailureSignal(log) ||
    hasMigrationFailureSignal(log)
  )
}

export function isIgnorableCancelledSibling(
  ctx: Pick<WorkflowRunContext, 'jobConclusions'>,
  jobName: string,
  logs: Map<string, string>,
  logFetchFailures: Set<string>,
): boolean {
  if (ctx.jobConclusions?.get(jobName) !== 'cancelled') return false
  if (logFetchFailures.has(jobName)) return false
  const log = logs.get(jobName) ?? ''
  if (log.includes(LOG_OMISSION_MARKER.trim())) return false
  return (
    log.trim().length > 0 &&
    hasCleanCancellationMarker(log) &&
    !hasUnrecognizedActionsError(log) &&
    !hasDurableCancelledSiblingFailure(log)
  )
}
