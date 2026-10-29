export const BLOCKER_PHASES = [
  'form_intake',
  'form_assessments',
  'form_screening_targets',
  'form_screening_receipts',
  'territorial_receipts',
  'territorial_redress',
  'restrictions',
  'submissions',
  'legal_hold_assessments',
  'action_work_items',
  'enforcement_assessments',
  'enforcement_reversal_requests',
  'enforcement_screening_targets',
  'enforcement_screening_receipts',
  'enforcement_targets',
  'deadlines',
  'email_links',
  'incidents',
  'delivery_work_items',
  'guest_capabilities',
  'done',
] as const

export type BlockerPhase = (typeof BLOCKER_PHASES)[number]
export type BlockerCursor = {
  phase: BlockerPhase | null
  childId: string | null
  assessmentId: string | null
  generation: string | null
}
export type BlockerPage = BlockerCursor & { blocked: boolean; done: boolean }

export function nextCopyrightThreadBlockerPhase(phase: BlockerPhase): BlockerPhase {
  const index = BLOCKER_PHASES.indexOf(phase)
  return BLOCKER_PHASES[Math.min(index + 1, BLOCKER_PHASES.length - 1)]!
}

export function advanceCopyrightThreadBlockerPhase(
  cursor: BlockerCursor,
  phase: BlockerPhase = nextCopyrightThreadBlockerPhase(cursor.phase!),
): BlockerCursor & { blocked: false } {
  return {
    ...cursor,
    phase,
    childId: null,
    assessmentId: null,
    blocked: false,
  }
}

export function completeCopyrightThreadBlockerPage(
  cursor: BlockerCursor,
  rows: readonly { id: string; blocked: boolean }[],
  batchSize: number,
): BlockerCursor & { blocked: boolean } {
  if (rows.some(row => row.blocked)) return { ...cursor, blocked: true }
  if (rows.length < batchSize) return advanceCopyrightThreadBlockerPhase(cursor)
  return { ...cursor, childId: rows.at(-1)!.id, blocked: false }
}

export function skipCopyrightThreadEnforcementAssessment(
  cursor: BlockerCursor,
): BlockerCursor & { blocked: false } {
  return {
    ...cursor,
    phase: 'enforcement_assessments',
    childId: cursor.assessmentId,
    assessmentId: null,
    blocked: false,
  }
}
