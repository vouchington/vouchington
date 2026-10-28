import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { deleteCopyrightEvidenceObjectVersions } from './retention-erasure-s3.mts'

/** A child page is capped independently; an incomplete intake stays at the cursor until the next page. */
export async function deleteChildPage(
  transaction: TransactionQuery,
  intakeId: string,
  remaining: number,
  table: string,
  column = 'copyright_notice_email_intake_id',
  orderBy = 'id',
): Promise<number> {
  const { rowCount } = await transaction(
    sql`/* deleteUnlinkedCopyrightEmailIntakeChildPage */ DELETE FROM `
      .append(table)
      .append(sql` WHERE ctid IN (
        SELECT ctid FROM `)
      .append(table)
      .append(sql` WHERE `)
      .append(column)
      .append(sql` = ${intakeId}`)
      .append(
        table === 'copyright_notice_email_intake_recommendations'
          ? sql` AND NOT EXISTS (
            SELECT 1 FROM copyright_notice_email_intake_reviews review
            WHERE review.copyright_notice_email_intake_recommendation_id =
              copyright_notice_email_intake_recommendations.id)`
          : sql``,
      )
      .append(sql` ORDER BY `)
      .append(orderBy)
      .append(sql` LIMIT ${remaining} FOR UPDATE)`),
  )
  return rowCount ?? 0
}

export async function lastActivityAndBlockers(transaction: TransactionQuery, intakeId: string) {
  const { rows } = await transaction<{
    last_activity_at: Date
    is_linked: boolean
    has_promoted_review: boolean
    has_pending_delivery: boolean
    has_linked_neighbor: boolean
    has_legal_delivery: boolean
    has_legal_review: boolean
    erased_at: Date | null
  }>(sql`/* inspectUnlinkedCopyrightEmailIntakeActivity */
    SELECT GREATEST(
      intake.created_at, intake.received_at,
      (SELECT parse.created_at FROM copyright_notice_email_intake_parses parse
       WHERE parse.copyright_notice_email_intake_id = intake.id ORDER BY parse.id DESC LIMIT 1),
      (SELECT attachment.created_at FROM copyright_notice_email_intake_attachments attachment
       WHERE attachment.copyright_notice_email_intake_id = intake.id ORDER BY attachment.id DESC LIMIT 1),
      (SELECT recommendation.created_at FROM copyright_notice_email_intake_recommendations recommendation
       WHERE recommendation.copyright_notice_email_intake_id = intake.id ORDER BY recommendation.id DESC LIMIT 1),
      (SELECT review.created_at FROM copyright_notice_email_intake_reviews review
       WHERE review.copyright_notice_email_intake_id = intake.id ORDER BY review.id DESC LIMIT 1),
      (SELECT reference.created_at FROM copyright_notice_email_thread_references reference
       WHERE reference.copyright_notice_email_intake_id = intake.id ORDER BY reference.id DESC LIMIT 1),
      (SELECT max(delivery.updated_at) FROM copyright_notice_delivery_work_items delivery
       WHERE delivery.copyright_notice_email_intake_id = intake.id)
    ) AS last_activity_at,
    EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
      WHERE link.copyright_notice_email_intake_id = intake.id)
      OR EXISTS (SELECT 1 FROM copyright_notice_correspondence_messages correspondence
        WHERE correspondence.copyright_notice_email_intake_id = intake.id)
      OR EXISTS (SELECT 1 FROM copyright_notice_email_correspondence_reviews review
        WHERE review.copyright_notice_email_intake_id = intake.id)
      OR EXISTS (SELECT 1 FROM copyright_notice_lifecycle_changes event
        WHERE event.copyright_notice_email_intake_id = intake.id) AS is_linked,
    EXISTS (SELECT 1 FROM copyright_notice_email_intake_reviews review
      WHERE review.copyright_notice_email_intake_id = intake.id
        AND review.promoted_copyright_notice_id IS NOT NULL) AS has_promoted_review,
    EXISTS (SELECT 1 FROM copyright_notice_delivery_work_items delivery
      WHERE delivery.copyright_notice_email_intake_id = intake.id
        AND delivery.state IN ('pending', 'claimed')) AS has_pending_delivery,
    EXISTS (SELECT 1 FROM copyright_notice_delivery_work_items delivery
      WHERE delivery.copyright_notice_email_intake_id = intake.id) AS has_legal_delivery,
    EXISTS (SELECT 1 FROM copyright_notice_email_intake_reviews review
      WHERE review.copyright_notice_email_intake_id = intake.id) AS has_legal_review,
    EXISTS (
      SELECT 1 FROM copyright_notice_email_message_ancestors edge
      JOIN copyright_notice_email_intake_notice_links neighbor
        ON neighbor.copyright_notice_email_intake_id = CASE
          WHEN edge.reply_message_intake_id = intake.id THEN edge.ancestor_message_intake_id
          ELSE edge.reply_message_intake_id END
      WHERE edge.reply_message_intake_id = intake.id OR edge.ancestor_message_intake_id = intake.id
    ) AS has_linked_neighbor
    , receipt.erased_at
    FROM copyright_notice_email_intakes intake
    JOIN copyright_notice_email_intake_receipts receipt ON receipt.id = intake.id
    WHERE intake.id = ${intakeId}`)
  return rows[0]
}

export async function eraseStorage(
  transaction: TransactionQuery,
  intakeId: string,
  storageObjectId: string | null,
): Promise<void> {
  if (!storageObjectId) return
  const { rows } = await transaction<{
    storage_key: string
  }>(sql`/* lockUnlinkedCopyrightEmailStorageObject */
    SELECT storage_key FROM copyright_notice_storage_objects
    WHERE id = ${storageObjectId} FOR UPDATE`)
  if (rows.length === 0) throw new Error('Copyright email evidence object is missing')
  const { rows: ownership } = await transaction<{
    is_exclusive: boolean
  }>(sql`/* checkUnlinkedCopyrightEmailStorageOwnership */
    SELECT NOT EXISTS (
      SELECT 1 FROM copyright_notice_email_intakes other
      WHERE other.raw_storage_object_id = ${storageObjectId} AND other.id <> ${intakeId}
    ) AND NOT EXISTS (
      SELECT 1 FROM copyright_notice_evidence_artifacts artifact
      WHERE artifact.storage_object_id = ${storageObjectId}
    ) AS is_exclusive`)
  if (ownership[0]?.is_exclusive) {
    await deleteCopyrightEvidenceObjectVersions([rows[0]!.storage_key])
  }
  await transaction(sql`/* clearUnlinkedCopyrightEmailStorageObject */
    UPDATE copyright_notice_email_intakes SET raw_storage_object_id = NULL WHERE id = ${intakeId}`)
  if (ownership[0]?.is_exclusive) {
    await transaction(sql`/* deleteUnlinkedCopyrightEmailStorageObject */
      DELETE FROM copyright_notice_storage_objects WHERE id = ${storageObjectId}`)
  }
}
