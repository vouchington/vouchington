import type {
  FeedbackCoverage,
  FeedbackDeliveryResult,
  FeedbackMode,
  WorkOutcome,
} from 'vouchington-tooling/agent-blackboard'

import type { FlagKey } from './parse-flag-args.mts'

export type FeedbackArgs = {
  mode?: string
  sourceEventId?: string
  workOutcome?: string
  coverageStatus?: string
  coverageSources?: string[]
  droppedCount?: string
  category?: string
  outboxDirectory?: string
}

export const FEEDBACK_FLAGS: Record<string, FlagKey<FeedbackArgs>> = {
  '--mode': 'mode',
  '--source-event-id': 'sourceEventId',
  '--work-outcome': 'workOutcome',
  '--coverage-status': 'coverageStatus',
  '--coverage-source': { key: 'coverageSources', type: 'repeatable' },
  '--dropped-count': 'droppedCount',
  '--category': 'category',
  '--outbox-directory': 'outboxDirectory',
}

export function feedbackMode(value: string | undefined): FeedbackMode {
  if (value !== 'interactive' && value !== 'autonomous')
    throw new Error('requires --mode interactive|autonomous; execution mode cannot be inferred')
  return value
}

export function feedbackOutcome(value: string | undefined, journal: boolean): WorkOutcome {
  const outcome = value ?? (journal ? 'in-progress' : undefined)
  if (
    outcome !== 'in-progress' &&
    outcome !== 'success' &&
    outcome !== 'failure' &&
    outcome !== 'cancelled' &&
    outcome !== 'timed-out' &&
    outcome !== 'no-change' &&
    outcome !== 'policy-refusal' &&
    outcome !== 'unknown'
  )
    throw new Error('requires a valid --work-outcome')
  if (!journal && outcome === 'in-progress')
    throw new Error('retrospective requires a terminal --work-outcome')
  return outcome
}

export function feedbackCoverage(parsed: FeedbackArgs): FeedbackCoverage {
  const status = parsed.coverageStatus ?? 'not-assessed'
  if (
    status !== 'complete' &&
    status !== 'partial' &&
    status !== 'unavailable' &&
    status !== 'not-assessed' &&
    status !== 'not-started'
  )
    throw new Error('invalid --coverage-status')
  const droppedCount = parsed.droppedCount === undefined ? 0 : Number(parsed.droppedCount)
  if (!Number.isSafeInteger(droppedCount) || droppedCount < 0)
    throw new Error('--dropped-count must be a non-negative integer')
  return { status, sources: parsed.coverageSources ?? [], droppedCount }
}

export function feedbackResult(result: FeedbackDeliveryResult): string {
  if (result.status === 'pending')
    return `Feedback pending (${result.sourceEventId}); durable outbox contains ${result.pendingCount} record(s); ${result.diagnostic}.`
  return `Feedback delivered (${result.sourceEventId}) to agent-blackboard session ${result.receipt.sessionId} (entry created at ${result.receipt.createdAt}); read-back verified; ${result.pendingCount} pending.`
}
