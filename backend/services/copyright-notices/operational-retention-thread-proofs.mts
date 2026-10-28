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
  cursor_blocker_assessment_id: string | null
  cursor_blocker_territorial_decision_id: string | null
  cursor_blocker_generation: string | null
  cursor_blocker_found_qualifying_assessment: boolean
  cursor_blocker_found_screening_target: boolean
  cursor_blocker_found_claimant_receipt: boolean
}

/** Both paged proofs must match current generations before any irreversible delete. */
export async function checkCopyrightThreadProofPage(
  transaction: TransactionQuery,
  noticeId: string,
  now: Date,
  cutoff: Date,
  batchSize: number,
  upperBound: string,
  cursor: ThreadProofCursor,
): Promise<{ legal: LegalPage; blocker: BlockerPage } | null> {
  const legal = await checkCopyrightThreadLegalPage(transaction, noticeId, cutoff, batchSize, {
    phase: cursor.cursor_legal_phase,
    childId: cursor.cursor_legal_child_id,
    holdGeneration: cursor.cursor_legal_hold_generation,
    partyGeneration: cursor.cursor_case_party_generation,
    latestReleaseAt: cursor.cursor_legal_latest_release_at,
  })
  if (legal.blocked) {
    await advanceCopyrightThreadCaseCursor(transaction, noticeId, upperBound)
    return null
  }
  await saveCopyrightThreadLegalProof(transaction, legal, upperBound)
  if (legal.phase !== 'done') return null

  const blocker = await checkCopyrightThreadBlockerPage(transaction, noticeId, now, batchSize, {
    phase: cursor.cursor_blocker_phase,
    childId: cursor.cursor_blocker_child_id,
    assessmentId: cursor.cursor_blocker_assessment_id,
    territorialDecisionId: cursor.cursor_blocker_territorial_decision_id,
    generation: cursor.cursor_blocker_generation,
    foundQualifyingAssessment: cursor.cursor_blocker_found_qualifying_assessment,
    foundScreeningTarget: cursor.cursor_blocker_found_screening_target,
    foundClaimantReceipt: cursor.cursor_blocker_found_claimant_receipt,
  })
  if (blocker.blocked) {
    await advanceCopyrightThreadCaseCursor(transaction, noticeId, upperBound)
    return null
  }
  await saveCopyrightThreadBlockerProof(transaction, blocker, upperBound)
  return blocker.done ? { legal, blocker } : null
}
