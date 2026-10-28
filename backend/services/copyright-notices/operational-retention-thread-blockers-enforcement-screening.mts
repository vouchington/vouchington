import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  skipCopyrightThreadEnforcementAssessment,
  type BlockerCursor,
} from './operational-retention-thread-blockers-state.mts'

export async function readCopyrightThreadEnforcementScreeningPage(
  transaction: TransactionQuery,
  noticeId: string,
  batchSize: number,
  cursor: BlockerCursor,
): Promise<BlockerCursor & { blocked: boolean }> {
  if (cursor.phase === 'enforcement_screening_targets') {
    const { rows } = await transaction<{ id: string; qualifies: boolean }>(sql`
      /* scanCopyrightThreadEnforcementScreeningTargets */
      WITH page AS MATERIALIZED (
        SELECT id, hosted_use_url FROM copyright_notice_targets
        WHERE copyright_notice_id = ${noticeId}
          AND id > COALESCE(${cursor.childId}::uuid,
            '00000000-0000-0000-0000-000000000000'::uuid)
        ORDER BY id LIMIT ${batchSize}
      )
      SELECT page.id, (char_length(btrim(page.hosted_use_url)) > 0 AND EXISTS (
        SELECT 1 FROM copyright_notice_target_images image
        WHERE image.copyright_notice_target_id = page.id LIMIT 1
      )) AS qualifies FROM page`)
    if (rows.some(row => row.qualifies)) {
      return {
        ...cursor,
        phase: 'enforcement_screening_receipts',
        childId: null,
        foundScreeningTarget: true,
        blocked: false,
      }
    }
    if (rows.length < batchSize) return skipCopyrightThreadEnforcementAssessment(cursor)
    return { ...cursor, childId: rows.at(-1)!.id, blocked: false }
  }
  if (cursor.phase === 'enforcement_screening_receipts') {
    const { rows } = await transaction<{ id: string; qualifies: boolean }>(sql`
      /* scanCopyrightThreadEnforcementScreeningReceipts */
      WITH page AS MATERIALIZED (
        SELECT id, recipient_role, channel, delivery_kind
        FROM copyright_notice_delivery_work_items
        WHERE copyright_notice_id = ${noticeId}
          AND id > COALESCE(${cursor.childId}::uuid,
            '00000000-0000-0000-0000-000000000000'::uuid)
        ORDER BY id LIMIT ${batchSize}
      )
      SELECT page.id, (page.recipient_role = 'claimant' AND page.channel = 'email'
        AND page.delivery_kind = 'claimant_receipt' AND EXISTS (
          SELECT 1 FROM copyright_notice_delivery_recipients recipient
          WHERE recipient.copyright_notice_delivery_work_item_id = page.id LIMIT 1
        )) AS qualifies FROM page`)
    if (rows.some(row => row.qualifies)) {
      return {
        ...cursor,
        phase: 'enforcement_targets',
        childId: null,
        foundClaimantReceipt: true,
        blocked: false,
      }
    }
    if (rows.length < batchSize) return skipCopyrightThreadEnforcementAssessment(cursor)
    return { ...cursor, childId: rows.at(-1)!.id, blocked: false }
  }
  throw new Error(`Unexpected enforcement screening phase: ${cursor.phase}`)
}
