import type { CopyrightOperationalCursor } from './operational-retention-cursor.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import {
  checkCopyrightThreadBlockerPage,
  type BlockerPage,
  type BlockerPhase,
} from './operational-retention-thread-blockers.mts'
import {
  advanceCopyrightThreadCaseCursor,
  saveCopyrightThreadBlockerProof,
} from './operational-retention-thread-cursor.mts'

export type ThreadProofCursor = {
  cursor_blocker_phase: BlockerPhase | null
  cursor_blocker_child_id: string | null
  cursor_blocker_assessment_identity_id: string | null
  cursor_blocker_generation: string | null
}

/** The paged business proof must match its current generation before any irreversible delete. */
export async function checkCopyrightThreadProofPage(
  transaction: TransactionQuery,
  noticeId: string,
  now: Date,
  batchSize: number,
  upperBound: string,
  cursor: ThreadProofCursor,
  progress?: CopyrightOperationalCursor,
): Promise<{ blocker: BlockerPage } | null> {
  const blocker = await checkCopyrightThreadBlockerPage(transaction, noticeId, now, batchSize, {
    phase: cursor.cursor_blocker_phase,
    childId: cursor.cursor_blocker_child_id,
    assessmentId: cursor.cursor_blocker_assessment_identity_id,
    generation: cursor.cursor_blocker_generation,
  })
  if (blocker.blocked) {
    await advanceCopyrightThreadCaseCursor(transaction, noticeId, upperBound, progress)
    return null
  }
  await saveCopyrightThreadBlockerProof(transaction, blocker, upperBound, progress)
  return blocker.done ? { blocker } : null
}
