import type { TransactionQuery } from '@data-stores/psql/types'
import sql, { type SQLStatement } from 'sql-template-strings'
import {
  completeCopyrightThreadBlockerPage,
  type BlockerCursor,
} from './operational-retention-thread-blockers-state.mts'
import { readCopyrightThreadEnforcementPage } from './operational-retention-thread-blockers-enforcement.mts'

type Row = { id: string; blocked: boolean }

export async function readCopyrightThreadStaffPage(
  transaction: TransactionQuery,
  noticeId: string,
  batchSize: number,
  cursor: BlockerCursor,
): Promise<BlockerCursor & { blocked: boolean }> {
  const phase = cursor.phase!
  if (phase.startsWith('enforcement_')) {
    return readCopyrightThreadEnforcementPage(transaction, noticeId, batchSize, cursor)
  }
  const query = staffPageSql(phase, noticeId, cursor.childId, batchSize)
  const { rows } = await transaction<Row>(query)
  return completeCopyrightThreadBlockerPage(cursor, rows, batchSize)
}

function staffPageSql(
  phase: NonNullable<BlockerCursor['phase']>,
  noticeId: string,
  childId: string | null,
  batchSize: number,
): SQLStatement {
  const after = childId ?? '00000000-0000-0000-0000-000000000000'
  switch (phase) {
    case 'territorial_receipts':
      return sql`/* scanCopyrightThreadTerritorialReceiptBlockers */
        WITH owner AS MATERIALIZED (SELECT ${noticeId}::uuid AS notice_id),
        page AS MATERIALIZED (
          SELECT id, copyright_notice_id, jurisdiction
          FROM copyright_territorial_notice_receipts
          WHERE copyright_notice_id = (SELECT notice_id FROM owner) AND id > ${after}::uuid
          ORDER BY id LIMIT ${batchSize}
        )
        SELECT page.id,
          notice.current_territorial_decision_identity_id IS NULL AS blocked
        FROM page JOIN copyright_notices notice ON notice.id = page.copyright_notice_id`
    case 'territorial_redress':
      return sql`/* scanCopyrightThreadTerritorialRedressBlockers */
        WITH owner AS MATERIALIZED (SELECT ${noticeId}::uuid AS notice_id),
        page AS MATERIALIZED (
          SELECT id, copyright_territorial_decision_id, staff_disposition
          FROM copyright_territorial_redress_requests
          WHERE copyright_notice_id = (SELECT notice_id FROM owner) AND id > ${after}::uuid
          ORDER BY id LIMIT ${batchSize}
        )
        SELECT page.id, (
          notice.current_territorial_decision_identity_id = page.copyright_territorial_decision_id
          AND (page.staff_disposition IS NULL OR
            (notice.territorial_decision_outcome = 'no_action'
              AND page.staff_disposition = 'revoke'))
        ) AS blocked FROM page
        JOIN copyright_notices notice ON notice.id = ${noticeId}`
    case 'restrictions':
      return sql`/* scanCopyrightThreadRestrictionBlockers */
        WITH owner AS MATERIALIZED (SELECT ${noticeId}::uuid AS notice_id),
        page AS MATERIALIZED (
          SELECT id, lifted_at, human_reviewed_at FROM copyright_restrictions
          WHERE copyright_notice_id = (SELECT notice_id FROM owner) AND id > ${after}::uuid
          ORDER BY id LIMIT ${batchSize}
        )
        SELECT page.id, (page.lifted_at IS NULL OR EXISTS (
          SELECT 1 FROM copyright_staydown_entries entry
          JOIN copyright_staydown_matches match
            ON match.copyright_staydown_entry_id = entry.id
              AND match.reviewed_at IS NULL
          WHERE entry.copyright_restriction_id = page.id LIMIT 1
        )) AS blocked FROM page`
    case 'submissions':
      return sql`/* scanCopyrightThreadSubmissionBlockers */
        WITH owner AS MATERIALIZED (SELECT ${noticeId}::uuid AS notice_id),
        page AS MATERIALIZED (
          SELECT id, kind FROM copyright_notice_submissions
          WHERE copyright_notice_id = (SELECT notice_id FROM owner) AND id > ${after}::uuid
          ORDER BY id LIMIT ${batchSize}
        )
        SELECT page.id, CASE
          WHEN page.kind = 'appeal' THEN NOT EXISTS (
            SELECT 1 FROM copyright_notice_appeal_reviews review
            WHERE review.copyright_notice_submission_id = page.id LIMIT 1)
          WHEN page.kind = 'counter_notice' THEN NOT EXISTS (
            SELECT 1 FROM copyright_notice_counter_notice_reviews review
            WHERE review.copyright_notice_submission_id = page.id LIMIT 1)
          WHEN page.kind = 'court_or_ccb_hold' THEN NOT EXISTS (
            SELECT 1 FROM copyright_notice_legal_hold_assessments assessment
            WHERE assessment.copyright_notice_submission_id = page.id LIMIT 1)
          ELSE false END AS blocked FROM page`
    case 'legal_hold_assessments':
      return sql`/* scanCopyrightThreadHoldAssessmentBlockers */
        WITH owner AS MATERIALIZED (SELECT ${noticeId}::uuid AS notice_id),
        page AS MATERIALIZED (
          SELECT id, copyright_notice_submission_id, is_from_original_claimant,
            is_same_material, proceeding_kind,
            commenced_at, received_by_designated_agent_at
          FROM copyright_notice_legal_hold_assessments
          WHERE copyright_notice_id = (SELECT notice_id FROM owner) AND id > ${after}::uuid
          ORDER BY id LIMIT ${batchSize}
        )
        SELECT page.id, (submission.kind = 'court_or_ccb_hold'
          AND page.is_from_original_claimant AND page.is_same_material
          AND page.proceeding_kind IS NOT NULL AND page.commenced_at IS NOT NULL
          AND page.received_by_designated_agent_at IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM copyright_notice_legal_hold_resolutions resolution
            WHERE resolution.copyright_notice_legal_hold_assessment_id = page.id LIMIT 1
          )) AS blocked FROM page
        JOIN copyright_notice_submissions submission
          ON submission.id = page.copyright_notice_submission_id`
    case 'action_work_items':
      return sql`/* scanCopyrightThreadActionBlockers */
        WITH owner AS MATERIALIZED (SELECT ${noticeId}::uuid AS notice_id),
        page AS MATERIALIZED (
          SELECT id, state FROM copyright_notice_action_work_items
          WHERE copyright_notice_id = (SELECT notice_id FROM owner) AND id > ${after}::uuid
          ORDER BY id LIMIT ${batchSize}
        ) SELECT id, state = 'failed' AS blocked FROM page`
    default:
      throw new Error(`Unexpected copyright staff blocker phase: ${phase}`)
  }
}
