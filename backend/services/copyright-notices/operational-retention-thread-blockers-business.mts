import type { TransactionQuery } from '@data-stores/psql/types'
import sql, { type SQLStatement } from 'sql-template-strings'
import {
  completeCopyrightThreadBlockerPage,
  type BlockerCursor,
} from './operational-retention-thread-blockers-state.mts'

type Row = { id: string; blocked: boolean }

export async function readCopyrightThreadBusinessPage(
  transaction: TransactionQuery,
  noticeId: string,
  now: Date,
  batchSize: number,
  cursor: BlockerCursor,
): Promise<BlockerCursor & { blocked: boolean }> {
  const { rows } = await transaction<Row>(
    businessPageSql(cursor.phase!, noticeId, now, cursor.childId, batchSize),
  )
  return completeCopyrightThreadBlockerPage(cursor, rows, batchSize)
}

function businessPageSql(
  phase: NonNullable<BlockerCursor['phase']>,
  noticeId: string,
  now: Date,
  childId: string | null,
  batchSize: number,
): SQLStatement {
  const after = childId ?? '00000000-0000-0000-0000-000000000000'
  switch (phase) {
    case 'deadlines':
      return sql`/* scanCopyrightThreadDeadlineBlockers */
        WITH owner AS MATERIALIZED (SELECT ${noticeId}::uuid AS notice_id),
        page AS MATERIALIZED (
          SELECT id, resolved_at, cancelled_at, escalation_at
          FROM copyright_notice_deadlines
          WHERE copyright_notice_id = (SELECT notice_id FROM owner) AND id > ${after}::uuid
          ORDER BY id LIMIT ${batchSize}
        )
        SELECT id, (resolved_at IS NULL AND cancelled_at IS NULL) AS blocked FROM page`
    case 'email_links':
      return sql`/* scanCopyrightThreadEmailLinkBlockers */
        WITH owner AS MATERIALIZED (SELECT ${noticeId}::uuid AS notice_id),
        page AS MATERIALIZED (
          SELECT id, copyright_notice_email_intake_receipt_id, link_kind
          FROM copyright_notice_email_intake_notice_links
          WHERE copyright_notice_id = (SELECT notice_id FROM owner) AND id > ${after}::uuid
          ORDER BY id LIMIT ${batchSize}
        )
        SELECT page.id, (page.link_kind = 'thread' AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_email_intake_receipts receipt
          WHERE receipt.id = page.copyright_notice_email_intake_receipt_id
            AND receipt.review_decision IS NOT NULL
          LIMIT 1
        ) AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_email_intake_notice_links reviewed
          WHERE reviewed.copyright_notice_email_intake_receipt_id = page.copyright_notice_email_intake_receipt_id
            AND reviewed.correspondence_action IN ('admitted', 'rejected') LIMIT 1
        )) AS blocked FROM page`
    case 'incidents':
      return sql`/* scanCopyrightThreadIncidentBlockers */
        WITH owner AS MATERIALIZED (SELECT ${noticeId}::uuid AS notice_id),
        page AS MATERIALIZED (
          SELECT id, is_operative FROM copyright_repeat_infringer_incidents
          WHERE copyright_notice_id = (SELECT notice_id FROM owner) AND id > ${after}::uuid
          ORDER BY id LIMIT ${batchSize}
        ) SELECT id, is_operative AS blocked FROM page`
    case 'delivery_work_items':
      return sql`/* scanCopyrightThreadDeliveryBlockers */
        WITH owner AS MATERIALIZED (SELECT ${noticeId}::uuid AS notice_id),
        page AS MATERIALIZED (
          SELECT id, state FROM copyright_notice_delivery_work_items
          WHERE copyright_notice_id = (SELECT notice_id FROM owner) AND id > ${after}::uuid
          ORDER BY id LIMIT ${batchSize}
        ) SELECT id, state IN ('pending', 'claimed') AS blocked FROM page`
    case 'guest_capabilities':
      return sql`/* scanCopyrightThreadGuestCapabilityBlockers */
        WITH owner AS MATERIALIZED (SELECT ${noticeId}::uuid AS notice_id),
        page AS MATERIALIZED (
          SELECT id, revoked_at, expires_at FROM copyright_notice_guest_capabilities
          WHERE copyright_notice_id = (SELECT notice_id FROM owner) AND id > ${after}::uuid
          ORDER BY id LIMIT ${batchSize}
        ) SELECT id, (revoked_at IS NULL AND expires_at > ${now}) AS blocked FROM page`
    default:
      throw new Error(`Unexpected copyright business blocker phase: ${phase}`)
  }
}
