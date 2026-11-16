import type { TransactionQuery } from '@data-stores/psql/types'
import {
  checkCopyrightThreadLegalPage,
  type LegalPage,
  type LegalPhase,
} from './operational-retention-thread-legal.mts'
import {
  checkCopyrightThreadBlockerPage,
  type BlockerPage,
  type BlockerPhase,
} from './operational-retention-thread-blockers.mts'
import {
  advanceCopyrightThreadCaseCursor,
  saveCopyrightThreadBlockerProof,
  saveCopyrightThreadLegalProof,
} from './operational-retention-thread-cursor.mts'

export type ThreadProofCursor = {
  cursor_legal_phase: LegalPhase | null
  cursor_legal_child_id: string | null
  cursor_legal_hold_generation: string | null
  cursor_case_party_generation: string | null
  cursor_legal_latest_release_at: Date | null
  cursor_blocker_phase: BlockerPhase | null
  cursor_blocker_child_id: string | null
  cursor_blocker_assessment_identity_id: string | null
  cursor_blocker_generation: string | null
}

export type ThreadPageProof = { legal: LegalPage; blocker: BlockerPage | null }

/** Calculate one bounded proof page without advancing its persisted cursor. */
export async function readCopyrightThreadProofPage(
  transaction: TransactionQuery,
  noticeId: string,
  now: Date,
  cutoff: Date,
  batchSize: number,
  cursor: ThreadProofCursor,
): Promise<ThreadPageProof> {
  const legal = await checkCopyrightThreadLegalPage(transaction, noticeId, cutoff, batchSize, {
    phase: cursor.cursor_legal_phase,
    childId: cursor.cursor_legal_child_id,
    holdGeneration: cursor.cursor_legal_hold_generation,
    partyGeneration: cursor.cursor_case_party_generation,
    latestReleaseAt: cursor.cursor_legal_latest_release_at,
  })
  if (legal.blocked || legal.phase !== 'done') return { legal, blocker: null }

  const blocker = await checkCopyrightThreadBlockerPage(transaction, noticeId, now, batchSize, {
    phase: cursor.cursor_blocker_phase,
    childId: cursor.cursor_blocker_child_id,
    assessmentId: cursor.cursor_blocker_assessment_identity_id,
    generation: cursor.cursor_blocker_generation,
  })
  return { legal, blocker }
}

/** Persist the original blocked, partial, or complete proof once, after writer ordering. */
export async function saveCopyrightThreadPageProof(
  transaction: TransactionQuery,
  noticeId: string,
  upperBound: string,
  proof: ThreadPageProof,
): Promise<void> {
  if (proof.legal.blocked) {
    await advanceCopyrightThreadCaseCursor(transaction, noticeId, upperBound)
    return
  }
  await saveCopyrightThreadLegalProof(transaction, proof.legal, upperBound)
  if (!proof.blocker) return
  if (proof.blocker.blocked) {
    await advanceCopyrightThreadCaseCursor(transaction, noticeId, upperBound)
    return
  }
  await saveCopyrightThreadBlockerProof(transaction, proof.blocker, upperBound)
}
