import { createHash, randomUUID } from 'node:crypto'
import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import {
  attachCopyrightEncryptionKey,
  prepareCopyrightEncryptionKey,
} from '../services/copyright-notices/encryption-keys.mts'
import { destroyCopyrightOwnerEncryptionKey } from '../services/copyright-notices/encryption-key-destruction.mts'
import { copyrightEmailIntakePurpose } from '../services/copyright-notices/email-intakes.mts'
import { upsertCopyrightStorageObjectId } from '../services/copyright-notices/storage-objects.mts'
import { upsertMediaTypes } from '../services/urls/media-types.mts'

const HISTORICAL_REVIEW = new Date('2018-01-15T12:00:00.000Z')

/** A retained owner after private-intake removal, with a real receipt DEK and encrypted final result. */
export async function seedHistoricalCopyrightReceiptExplanation(
  reviewerId: string,
  options: { withLiveIntake?: boolean; reviewedAt?: Date; decision?: 'rejected' | 'approved' } = {},
) {
  const reviewedAt = options.reviewedAt ?? HISTORICAL_REVIEW
  const id = uuidv7({ msecs: reviewedAt.getTime() })
  const sesMessageId = `retained-receipt-${randomUUID()}`
  const rawStorageKey = `email/${sesMessageId}/original.eml`
  const rawSha256 = createHash('sha256').update(sesMessageId).digest()
  const reason = `Final staff explanation ${randomUUID()}`
  await using prepared = await prepareCopyrightEncryptionKey('receipt')
  await using privateKey = options.withLiveIntake
    ? await prepareCopyrightEncryptionKey('intake')
    : null
  await using query = await beginTransaction()
  await query(sql`/* seedHistoricalCopyrightReceiptExplanation */
    INSERT INTO copyright_notice_email_intake_receipts
      (id, amazon_ses_message_id, raw_sha256, raw_storage_key_sha256, raw_byte_size)
    VALUES (${id}, ${sesMessageId}, ${rawSha256},
      ${createHash('sha256').update(rawStorageKey).digest()}, 12)`)
  await attachCopyrightEncryptionKey(prepared, { kind: 'receipt', id }, query)
  if (options.withLiveIntake) {
    const mediaTypeId = await upsertMediaTypes('message/rfc822', { query })
    const storageObjectId = await upsertCopyrightStorageObjectId(rawStorageKey, query)
    await query(sql`/* seedHistoricalCopyrightLiveIntake */
      INSERT INTO copyright_notice_email_intakes (
        id, amazon_ses_message_id, received_at, raw_storage_object_id, raw_sha256,
        raw_media_type_id, raw_byte_size, spf_verdict, dkim_verdict, dmarc_verdict, spam_verdict, virus_verdict
      ) VALUES (
        ${id}, ${sesMessageId}, ${reviewedAt}, ${storageObjectId}, ${rawSha256},
        ${mediaTypeId}, 12, 'pass', 'pass', 'pass', 'pass', 'pass'
      )`)
    await attachCopyrightEncryptionKey(privateKey!, { kind: 'intake', id }, query)
  }
  const ciphertext = prepared.encrypt(
    JSON.stringify({ rationale: reason, manual_fallback_reason: null }),
    copyrightEmailIntakePurpose(sesMessageId),
    { kind: 'receipt', id },
  )
  await query(sql`/* finishHistoricalCopyrightReceiptExplanation */
    UPDATE copyright_notice_email_intake_receipts SET
      review_decision = ${options.decision ?? 'rejected'}, reviewed_at = ${reviewedAt},
      reviewed_by_id = ${reviewerId}, review_rationale_ciphertext = ${ciphertext},
      erased_at = ${options.withLiveIntake ? null : new Date(reviewedAt.getTime() + 91 * 86_400_000)}
    WHERE id = ${id}`)
  await query.commit()
  return { id, sesMessageId, rawStorageKey, rawSha256, reason, ciphertext, keyId: prepared.id }
}

function offsetUuid(id: string, offset: bigint): string {
  const value = BigInt(`0x${id.replaceAll('-', '')}`) + offset
  const hex = value.toString(16).padStart(32, '0')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}

/** Reserve exactly one receipt identity in the persisted singleton sweep. */
export async function positionCopyrightReceiptExplanationCursor(id: string): Promise<void> {
  await write(sql`/* positionCopyrightReceiptExplanationCursor */
    INSERT INTO copyright_notice_operational_retention_cursors
      (kind, cursor_record_id, sweep_upper_bound_record_id)
    VALUES ('receipt_explanations', ${offsetUuid(id, -1n)}::uuid, ${offsetUuid(id, 1n)}::uuid)
    ON CONFLICT (kind) DO UPDATE SET
      cursor_record_id = EXCLUDED.cursor_record_id,
      sweep_upper_bound_record_id = EXCLUDED.sweep_upper_bound_record_id`)
}

export async function readCopyrightReceiptExplanationEligibility(id: string): Promise<boolean> {
  const { rows } = await read<{
    eligible: boolean
  }>(sql`/* readCopyrightReceiptExplanationEligibility */
    SELECT fn_project_copyright_receipt_explanation_eligible(${id}::uuid) AS eligible`)
  return rows[0]!.eligible
}

export async function readCopyrightReceiptExplanationState(id: string) {
  const { rows } = await read<{
    amazon_ses_message_id: string
    review_decision: string | null
    reviewed_at: Date | null
    reviewed_by_id: string | null
    erased_at: Date | null
    review_rationale_ciphertext: string | null
    final_explanation_erasure_started_at: Date | null
    final_explanation_erased_at: Date | null
    last_delivery_activity_at: Date | null
    last_preservation_hold_released_at: Date | null
    key_id: string | null
    key_destroyed_at: Date | null
    live_intake_exists: boolean
  }>(sql`/* readCopyrightReceiptExplanationState */
    SELECT receipt.amazon_ses_message_id, receipt.review_decision, receipt.reviewed_at,
      receipt.reviewed_by_id, receipt.erased_at, receipt.review_rationale_ciphertext,
      receipt.final_explanation_erasure_started_at, receipt.final_explanation_erased_at,
      receipt.last_delivery_activity_at, receipt.last_preservation_hold_released_at,
      key.id AS key_id, key.destroyed_at AS key_destroyed_at,
      EXISTS (SELECT 1 FROM copyright_notice_email_intakes intake WHERE intake.id = receipt.id) AS live_intake_exists
    FROM copyright_notice_email_intake_receipts receipt
    LEFT JOIN copyright_email_receipt_encryption_keys owned
      ON owned.copyright_notice_email_intake_receipt_id = receipt.id
    LEFT JOIN copyright_retention_keys key ON key.id = owned.copyright_retention_key_id
    WHERE receipt.id = ${id}`)
  return rows[0] ?? null
}

export async function readCopyrightEmailOwnerKeyIds(id: string) {
  const { rows } = await read<{ intake_key_id: string | null; receipt_key_id: string | null }>(sql`
    /* readCopyrightEmailOwnerKeyIds */
    SELECT intake.copyright_retention_key_id AS intake_key_id,
      receipt.copyright_retention_key_id AS receipt_key_id
    FROM copyright_notice_email_intake_receipts owner
    LEFT JOIN copyright_email_intake_encryption_keys intake
      ON intake.copyright_notice_email_intake_id = owner.id
    LEFT JOIN copyright_email_receipt_encryption_keys receipt
      ON receipt.copyright_notice_email_intake_receipt_id = owner.id
    WHERE owner.id = ${id}`)
  return rows[0]!
}

/** Model retained transport work after private-intake erasure; only its state and activity clock are read. */
export async function seedCopyrightReceiptDelivery(
  receiptId: string,
  kind: 'pending' | 'sent',
  ciphertext: string,
): Promise<void> {
  const id = kind === 'pending' ? uuidv7({ msecs: HISTORICAL_REVIEW.getTime() + 1 }) : uuidv7()
  const sentAt = kind === 'sent' ? new Date() : null
  await using query = await beginTransaction()
  await query(sql`/* seedCopyrightReceiptDelivery */
    INSERT INTO copyright_notice_delivery_work_items (
      id, copyright_notice_email_intake_receipt_id, recipient_role, delivery_kind,
      channel, idempotency_key, body_ciphertext, delivery_attempted_at, sent_at
    ) VALUES (
      ${id}, ${receiptId}, 'correspondent', 'email_intake_received', 'email',
      ${`receipt-delivery-${randomUUID()}`}, ${ciphertext}, ${sentAt}, ${sentAt}
    )`)
  await query.commit()
}

export async function linkHistoricalCopyrightReceipt(
  receiptId: string,
  noticeId: string,
): Promise<void> {
  await write(sql`/* linkHistoricalCopyrightReceipt */
    INSERT INTO copyright_notice_email_intake_notice_links
      (copyright_notice_email_intake_receipt_id, copyright_notice_id, link_kind)
    VALUES (${receiptId}, ${noticeId}, 'initial')`)
}

/** Preserve a historical case link while retiring its fixture-owned private intake. */
export async function retireLinkedHistoricalCopyrightPrivateIntake(
  receiptId: string,
): Promise<void> {
  await using query = await beginTransaction()
  const { rows } = await query<{ reviewed_at: Date }>(sql`/* lockLinkedHistoricalReceipt */
    SELECT receipt.reviewed_at FROM copyright_notice_email_intake_receipts receipt
    WHERE receipt.id = ${receiptId} AND EXISTS (
      SELECT 1 FROM copyright_notice_email_intake_notice_links link
      WHERE link.copyright_notice_email_intake_receipt_id = receipt.id
    ) FOR UPDATE`)
  if (!rows[0]?.reviewed_at) throw new Error('Historical receipt must be reviewed and linked')
  await query(sql`/* markLinkedHistoricalReceiptPrivateErasure */
    UPDATE copyright_notice_email_intake_receipts
    SET erased_at = ${new Date(rows[0].reviewed_at.getTime() + 91 * 86_400_000)}
    WHERE id = ${receiptId} AND erased_at IS NULL`)
  await destroyCopyrightOwnerEncryptionKey({ kind: 'intake', id: receiptId }, query)
  await query(sql`/* retireLinkedHistoricalPrivateIntake */
    DELETE FROM copyright_notice_email_intakes WHERE id = ${receiptId}`)
  await query.commit()
}
