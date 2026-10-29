import type { QueryExecutor, TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { deleteCopyrightEvidenceObjectVersionPage } from './retention-erasure-s3.mts'

/** A child page is capped independently; an incomplete intake stays at the cursor until the next page. */
export async function deleteChildPage(
  transaction: QueryExecutor,
  intakeId: string,
  remaining: number,
  table: string,
  column = 'copyright_notice_email_intake_id',
  orderBy = 'id',
): Promise<number> {
  if (table === 'copyright_notice_email_intake_recommendations') {
    // One review at most can retain a recommendation for this intake. The extra raw row
    // lets this page advance past that legal record without scanning the whole history.
    const { rowCount } = await transaction(sql`/* deleteUnlinkedCopyrightEmailRecommendations */
      WITH owner AS MATERIALIZED (SELECT ${intakeId}::uuid AS intake_id), candidates AS MATERIALIZED (
        -- no-mistakes-disable-next-line postgres-required-predicates: one receipt-indexed raw candidate page is capped before review eligibility; UUID age does not define intake ownership
        SELECT id FROM copyright_notice_email_intake_recommendations
        WHERE copyright_notice_email_intake_receipt_id = (SELECT intake_id FROM owner)
        ORDER BY id LIMIT ${remaining + 1} FOR UPDATE
      ), deletable AS MATERIALIZED (
        SELECT candidate.id FROM candidates candidate
        WHERE NOT EXISTS (
          -- no-mistakes-disable-next-line postgres-required-predicates: recommendation-indexed existence proof only for the capped candidate page; review UUID time is independent
          SELECT 1 FROM copyright_notice_email_intake_reviews review
          WHERE review.copyright_notice_email_intake_recommendation_id = candidate.id)
        ORDER BY candidate.id LIMIT ${remaining}
      )
      DELETE FROM copyright_notice_email_intake_recommendations recommendation
      USING deletable
      WHERE recommendation.id = deletable.id`)
    return rowCount ?? 0
  }
  const { rowCount } = await transaction(
    sql`/* deleteUnlinkedCopyrightEmailIntakeChildPage */
      WITH owner AS MATERIALIZED (SELECT ${intakeId}::uuid AS intake_id)
      DELETE FROM `
      .append(table)
      .append(sql` WHERE ctid IN (
        SELECT ctid FROM `)
      .append(table)
      .append(sql` WHERE `)
      .append(column)
      .append(sql` = (SELECT intake_id FROM owner)`)
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
    erased_at: Date | null
  }>(sql`/* inspectUnlinkedCopyrightEmailIntakeActivity */
    SELECT GREATEST(
      intake.created_at, intake.received_at,
      (SELECT parse.created_at FROM copyright_notice_email_intake_parses parse
       WHERE parse.copyright_notice_email_intake_id = intake.id ORDER BY parse.id DESC LIMIT 1),
      (SELECT attachment.created_at FROM copyright_notice_email_intake_attachments attachment
       WHERE attachment.copyright_notice_email_intake_id = intake.id ORDER BY attachment.id DESC LIMIT 1),
      intake.recommendation_completed_at,
      receipt.reviewed_at,
      (SELECT reference.created_at FROM copyright_notice_email_thread_references reference
       WHERE reference.copyright_notice_email_intake_id = intake.id ORDER BY reference.id DESC LIMIT 1),
      (SELECT max(delivery.updated_at) FROM copyright_notice_delivery_work_items delivery
       WHERE delivery.copyright_notice_email_intake_receipt_id = intake.id),
      (SELECT rationale.created_at FROM copyright_decision_rationales rationale
       WHERE rationale.copyright_notice_email_intake_receipt_id = intake.id
       ORDER BY rationale.id DESC LIMIT 1)
    ) AS last_activity_at,
    EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
      WHERE link.copyright_notice_email_intake_id = intake.id)
      OR EXISTS (SELECT 1 FROM copyright_notice_correspondence_messages correspondence
        WHERE correspondence.copyright_notice_email_intake_id = intake.id)
      AS is_linked,
    (receipt.review_decision = 'approved') AS has_promoted_review,
    EXISTS (SELECT 1 FROM copyright_notice_delivery_work_items delivery
      WHERE delivery.copyright_notice_email_intake_receipt_id = intake.id
        AND delivery.state IN ('pending', 'claimed')) AS has_pending_delivery,
    receipt.erased_at
    FROM copyright_notice_email_intakes intake
    JOIN copyright_notice_email_intake_receipts receipt ON receipt.id = intake.id
    WHERE intake.id = ${intakeId}`)
  return rows[0]
}

/** Inspect one indexed raw edge page, including protected edges, before advancing the cursor. */
export async function deleteUnlinkedAncestorEdgePage(
  transaction: TransactionQuery,
  intakeId: string,
  direction: 'reply' | 'ancestor',
  afterId: string | null,
  limit: number,
): Promise<{ done: boolean; lastId: string | null; scanned: number }> {
  const { rows } =
    direction === 'reply'
      ? await transaction<{ neighbor_id: string }>(sql`/* pageUnlinkedReplyAncestorEdges */
        SELECT ancestor_message_intake_receipt_id AS neighbor_id
        FROM copyright_notice_email_message_ancestors
        WHERE reply_message_intake_receipt_id = ${intakeId}
          AND ancestor_message_intake_receipt_id > COALESCE(${afterId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        ORDER BY ancestor_message_intake_receipt_id LIMIT ${limit}`)
      : await transaction<{ neighbor_id: string }>(sql`/* pageUnlinkedAncestorReplyEdges */
        SELECT reply_message_intake_receipt_id AS neighbor_id
        FROM copyright_notice_email_message_ancestors
        WHERE ancestor_message_intake_receipt_id = ${intakeId}
          AND reply_message_intake_receipt_id > COALESCE(${afterId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        ORDER BY reply_message_intake_receipt_id LIMIT ${limit}`)
  const neighbors = rows.map(row => row.neighbor_id)
  if (neighbors.length > 0) {
    if (direction === 'reply') {
      await transaction(sql`/* deleteUnlinkedReplyAncestorEdges */
        DELETE FROM copyright_notice_email_message_ancestors edge
        WHERE edge.reply_message_intake_receipt_id = ${intakeId}
          AND edge.ancestor_message_intake_receipt_id = ANY(${neighbors}::uuid[])
          AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
            WHERE link.copyright_notice_email_intake_id = edge.ancestor_message_intake_receipt_id)`)
    } else {
      await transaction(sql`/* deleteUnlinkedAncestorReplyEdges */
        DELETE FROM copyright_notice_email_message_ancestors edge
        WHERE edge.ancestor_message_intake_receipt_id = ${intakeId}
          AND edge.reply_message_intake_receipt_id = ANY(${neighbors}::uuid[])
          AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
            WHERE link.copyright_notice_email_intake_id = edge.reply_message_intake_receipt_id)`)
    }
  }
  return {
    done: rows.length < limit,
    lastId: rows.at(-1)?.neighbor_id ?? afterId,
    scanned: rows.length,
  }
}

export async function eraseStorage(
  transaction: TransactionQuery,
  intakeId: string,
  storageObjectId: string | null,
  workLimit: number,
): Promise<{ complete: boolean; scanned: number }> {
  if (!storageObjectId) return { complete: true, scanned: 0 }
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
  const versionPage = ownership[0]?.is_exclusive
    ? await deleteCopyrightEvidenceObjectVersionPage(rows[0]!.storage_key, workLimit)
    : { hasMore: false, scanned: 0 }
  if (versionPage.hasMore) return { complete: false, scanned: versionPage.scanned }
  await transaction(sql`/* clearUnlinkedCopyrightEmailStorageObject */
    UPDATE copyright_notice_email_intakes SET raw_storage_object_id = NULL WHERE id = ${intakeId}`)
  if (ownership[0]?.is_exclusive) {
    await transaction(sql`/* deleteUnlinkedCopyrightEmailStorageObject */
      DELETE FROM copyright_notice_storage_objects WHERE id = ${storageObjectId}`)
  }
  return { complete: true, scanned: versionPage.scanned }
}
