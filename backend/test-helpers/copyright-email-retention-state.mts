import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function readCopyrightEmailReceiptErasedAt(intakeId: string): Promise<Date | null> {
  const { rows } = await read<{ erased_at: Date | null }>(sql`
    /* readCopyrightEmailReceiptErasedAt */
    SELECT erased_at FROM copyright_notice_email_intake_receipts WHERE id = ${intakeId}`)
  if (!rows[0]) throw new Error('Owned copyright email receipt was not found')
  return rows[0].erased_at
}

export async function readCopyrightIntakeRetentionState(intakeId: string): Promise<{
  intakeExists: boolean
  receiptExists: boolean
  hasRawObject: boolean
  parseCount: number
  attachmentCount: number
  deliveryBody: string | null
  ancestorCount: number
}> {
  const { rows } = await read<{
    intake_exists: boolean
    receipt_exists: boolean
    has_raw_object: boolean
    parse_count: number
    attachment_count: number
    delivery_body: string | null
    ancestor_count: number
  }>(sql`/* readCopyrightIntakeRetentionState */
    SELECT EXISTS (SELECT 1 FROM copyright_notice_email_intakes WHERE id = ${intakeId}) AS intake_exists,
      EXISTS (SELECT 1 FROM copyright_notice_email_intake_receipts WHERE id = ${intakeId}) AS receipt_exists,
      EXISTS (SELECT 1 FROM copyright_notice_email_intakes
        WHERE id = ${intakeId} AND raw_storage_object_id IS NOT NULL) AS has_raw_object,
      (SELECT COUNT(*)::integer FROM copyright_notice_email_intake_parses
        WHERE copyright_notice_email_intake_id = ${intakeId}) AS parse_count,
      (SELECT COUNT(*)::integer FROM copyright_notice_email_intake_attachments
        WHERE copyright_notice_email_intake_id = ${intakeId}) AS attachment_count,
      (SELECT body_ciphertext FROM copyright_notice_delivery_work_items
        WHERE copyright_notice_email_intake_receipt_id = ${intakeId}
        ORDER BY id DESC LIMIT 1) AS delivery_body,
      (SELECT COUNT(*)::integer FROM copyright_notice_email_message_ancestors
        WHERE reply_message_intake_receipt_id = ${intakeId}
          OR ancestor_message_intake_receipt_id = ${intakeId}) AS ancestor_count`)
  const row = rows[0]!
  return {
    intakeExists: row.intake_exists,
    receiptExists: row.receipt_exists,
    hasRawObject: row.has_raw_object,
    parseCount: row.parse_count,
    attachmentCount: row.attachment_count,
    deliveryBody: row.delivery_body,
    ancestorCount: row.ancestor_count,
  }
}

/** Seed a receipt already fenced by a committed erasure tick, before testing later writers. */
export async function commitCopyrightEmailReceiptErasureMarker(intakeId: string): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* commitCopyrightEmailReceiptErasureMarker:context */
    SELECT set_config('app.copyright_retention_erasure', 'on', true),
      set_config('app.copyright_operational_retention', 'on', true)`)
  const { rowCount } = await transaction(sql`/* commitCopyrightEmailReceiptErasureMarker */
    UPDATE copyright_notice_email_intake_receipts
    SET erased_at = COALESCE(erased_at, CURRENT_TIMESTAMP) WHERE id = ${intakeId}`)
  if (rowCount !== 1) throw new Error('Expected exactly one owned copyright email receipt')
  await transaction.commit()
}
