import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { LegalPage } from './operational-retention-thread-legal.mts'
import type { BlockerPage } from './operational-retention-thread-blockers.mts'

export async function resetCopyrightThreadRetentionCursor(
  transaction: TransactionQuery,
): Promise<void> {
  await transaction(sql`/* resetCopyrightThreadRetentionCursor */
    UPDATE copyright_notice_operational_retention_cursors
    SET cursor_record_id = NULL, sweep_upper_bound_record_id = NULL,
      cursor_child_id = NULL, cursor_edge_id = NULL, cursor_phase = NULL,
      cursor_legal_phase = NULL, cursor_legal_child_id = NULL,
      cursor_legal_hold_generation = NULL, cursor_case_party_generation = NULL,
      cursor_legal_latest_release_at = NULL,
      cursor_blocker_phase = NULL, cursor_blocker_child_id = NULL,
      cursor_blocker_assessment_identity_id = NULL,
      cursor_blocker_generation = NULL
    WHERE kind = 'email_thread_references'`)
}

export async function advanceCopyrightThreadCaseCursor(
  transaction: TransactionQuery,
  noticeId: string,
  upperBound: string,
): Promise<void> {
  await transaction(sql`/* advanceCopyrightThreadCaseCursor */
    UPDATE copyright_notice_operational_retention_cursors
    SET cursor_record_id = ${noticeId}::uuid, cursor_child_id = NULL,
      cursor_edge_id = NULL, cursor_phase = NULL,
      cursor_legal_phase = NULL, cursor_legal_child_id = NULL,
      cursor_legal_hold_generation = NULL, cursor_case_party_generation = NULL,
      cursor_legal_latest_release_at = NULL,
      cursor_blocker_phase = NULL, cursor_blocker_child_id = NULL,
      cursor_blocker_assessment_identity_id = NULL,
      cursor_blocker_generation = NULL,
      sweep_upper_bound_record_id = ${upperBound}::uuid
    WHERE kind = 'email_thread_references'`)
}

export async function saveCopyrightThreadLegalProof(
  transaction: TransactionQuery,
  legal: LegalPage,
  upperBound: string,
): Promise<void> {
  await transaction(sql`/* advanceCopyrightThreadLegalProof */
    UPDATE copyright_notice_operational_retention_cursors
    SET cursor_legal_phase = ${legal.phase},
      cursor_legal_child_id = ${legal.childId}::uuid,
      cursor_legal_hold_generation = ${legal.holdGeneration}::bigint,
      cursor_case_party_generation = ${legal.partyGeneration}::bigint,
      cursor_legal_latest_release_at = ${legal.latestReleaseAt},
      sweep_upper_bound_record_id = ${upperBound}::uuid
    WHERE kind = 'email_thread_references'`)
}

export async function saveCopyrightThreadBlockerProof(
  transaction: TransactionQuery,
  blocker: BlockerPage,
  upperBound: string,
): Promise<void> {
  await transaction(sql`/* advanceCopyrightThreadBlockerProof */
    UPDATE copyright_notice_operational_retention_cursors
    SET cursor_blocker_phase = ${blocker.phase},
      cursor_blocker_child_id = ${blocker.childId}::uuid,
      cursor_blocker_assessment_identity_id = ${blocker.assessmentId}::uuid,
      cursor_blocker_generation = ${blocker.generation}::bigint,
      sweep_upper_bound_record_id = ${upperBound}::uuid
    WHERE kind = 'email_thread_references'`)
}
