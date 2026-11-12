import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { BlockerPage } from './operational-retention-thread-blockers.mts'

export async function resetCopyrightThreadRetentionCursor(
  transaction: TransactionQuery,
): Promise<void> {
  await transaction(sql`/* resetCopyrightThreadRetentionCursor */
    UPDATE copyright_notice_operational_retention_cursors
    SET cursor_record_id = NULL, sweep_upper_bound_record_id = NULL,
      cursor_child_id = NULL, cursor_edge_id = NULL, cursor_phase = NULL,
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
      cursor_blocker_phase = NULL, cursor_blocker_child_id = NULL,
      cursor_blocker_assessment_identity_id = NULL,
      cursor_blocker_generation = NULL,
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
