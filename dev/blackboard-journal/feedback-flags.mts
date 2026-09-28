import type {
  FeedbackCoverage,
  FeedbackMode,
  WorkOutcome,
} from 'vouchington-tooling/agent-blackboard'

const FEEDBACK_MODES = ['interactive', 'autonomous'] as const satisfies readonly FeedbackMode[]
const WORK_OUTCOMES = [
  'in-progress',
  'success',
  'failure',
  'cancelled',
  'timed-out',
  'no-change',
  'policy-refusal',
  'unknown',
] as const satisfies readonly WorkOutcome[]
const COVERAGE_STATUSES = [
  'complete',
  'partial',
  'unavailable',
  'not-assessed',
  'not-started',
] as const satisfies readonly FeedbackCoverage['status'][]

export type FeedbackFlagInput = {
  mode?: string
  sourceEventId?: string
  workOutcome?: string
  coverageStatus?: string
  coverageSource?: string
  droppedCount?: string
  outboxDirectory?: string
}

type ResolvedFeedbackFlags = {
  mode: FeedbackMode
  sourceEventId: string
  workOutcome: WorkOutcome
  feedbackCoverage: FeedbackCoverage
  outboxDirectory?: string
}

function isAllowed<T extends string>(value: string | undefined, allowed: readonly T[]): value is T {
  return value !== undefined && allowed.some(item => item === value)
}

function requireMember<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  flag: string,
): T {
  if (isAllowed(value, allowed)) return value
  throw new Error(`${flag} must be one of: ${allowed.join(', ')}`)
}

function parseDroppedCount(value: string | undefined): number {
  if (value === undefined) return 0
  if (!/^(0|[1-9][0-9]*)$/.test(value))
    throw new Error('--dropped-count must be a non-negative integer')
  const count = Number(value)
  if (!Number.isSafeInteger(count))
    throw new Error('--dropped-count must be a non-negative integer')
  return count
}

// vouchington-tooling's appendJournal requires these fields explicitly. The wrapper
// does not invent a mode, source identity, outcome, or coverage status.
export function resolveFeedbackFlags(input: FeedbackFlagInput): ResolvedFeedbackFlags {
  const mode = requireMember(input.mode, FEEDBACK_MODES, '--mode')
  if (!input.sourceEventId) throw new Error('--source-event-id is required')
  const workOutcome = requireMember(input.workOutcome, WORK_OUTCOMES, '--work-outcome')
  const status = requireMember(input.coverageStatus, COVERAGE_STATUSES, '--coverage-status')
  return {
    mode,
    sourceEventId: input.sourceEventId,
    workOutcome,
    feedbackCoverage: {
      status,
      sources: input.coverageSource === undefined ? [] : input.coverageSource.split(','),
      droppedCount: parseDroppedCount(input.droppedCount),
    },
    ...(input.outboxDirectory === undefined ? {} : { outboxDirectory: input.outboxDirectory }),
  }
}
