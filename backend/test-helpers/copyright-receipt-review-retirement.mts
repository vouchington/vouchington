import { createHash, randomUUID } from 'node:crypto'
import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { runSequentially } from '@modules/utils/run-sequentially'
import { v7 } from 'uuid'
import { onTestFinished } from 'vitest'
import { upsertMediaTypes } from '../services/urls/media-types.mts'
import { upsertCopyrightStorageObjectId } from '../services/copyright-notices/storage-objects.mts'

export async function seedCopyrightReceiptReview(input: {
  reviewerId: string
  reviewedAt: Date
  erased?: boolean
}): Promise<{ id: string; sesMessageId: string; rawStorageKey: string; rawSha256: Buffer }> {
  const id = v7({ msecs: Math.max(0, input.reviewedAt.getTime() - 86_400_000) })
  const sesMessageId = `receipt-review-${randomUUID()}`
  const rawStorageKey = `email/${sesMessageId}/original.eml`
  const rawSha256 = Buffer.alloc(32, 1)
  await write(sql`/* seedCopyrightReceiptReview */
    INSERT INTO copyright_notice_email_intake_receipts
      (id, amazon_ses_message_id, raw_sha256, raw_storage_key_sha256, raw_byte_size,
       erased_at, review_decision, reviewed_at, reviewed_by_id, review_rationale_ciphertext)
    VALUES (${id}, ${sesMessageId}, ${rawSha256}, ${createHash('sha256').update(rawStorageKey).digest()}, 12,
      ${input.erased === false ? null : input.reviewedAt}, 'rejected', ${input.reviewedAt},
      ${input.reviewerId}, 'v1:test-rationale')`)
  onTestFinished(async () => {
    await using transaction = await beginTransaction()
    await transaction(sql`/* deferOwnedCopyrightReceiptReview:permit */
      SELECT set_config('app.copyright_receipt_review_retirement', 'on', true)`)
    await transaction(sql`/* deferOwnedCopyrightReceiptReview */
      UPDATE copyright_notice_email_intake_receipts
      SET review_retirement_check_at = GREATEST(review_retirement_check_at, CURRENT_TIMESTAMP + interval '1 day')
      WHERE id = ${id} AND review_decision IS NOT NULL`)
    await transaction.commit()
  })
  return { id, sesMessageId, rawStorageKey, rawSha256 }
}

export async function readCopyrightReceiptReview(id: string) {
  const { rows } = await read<{
    amazon_ses_message_id: string
    review_decision: string | null
    reviewed_by_id: string | null
    reviewed_at: Date | null
    review_rationale_ciphertext: string | null
    review_retirement_check_at: Date | number
  }>(sql`/* readCopyrightReceiptReview */
    SELECT amazon_ses_message_id, review_decision, reviewed_by_id, reviewed_at,
      review_rationale_ciphertext, review_retirement_check_at
    FROM copyright_notice_email_intake_receipts WHERE id = ${id}`)
  return rows[0] ?? null
}

export async function readCopyrightReceiptHolds(receiptId: string) {
  const { rows } = await read<{ id: string; released_at: Date | null }>(
    sql`/* readCopyrightReceiptHolds */
      SELECT id, released_at FROM copyright_email_receipt_preservation_holds
      WHERE copyright_notice_email_intake_receipt_id = ${receiptId} ORDER BY id`,
  )
  return rows
}

export async function attemptCopyrightReceiptReviewMutation(id: string) {
  return write(sql`/* attemptCopyrightReceiptReviewMutation */
    UPDATE copyright_notice_email_intake_receipts
    SET review_decision = NULL, reviewed_at = NULL, reviewed_by_id = NULL,
      review_rationale_ciphertext = NULL
    WHERE id = ${id}`)
}

export async function seedOldCopyrightReceiptRationale(
  receipt: { id: string; sesMessageId: string; rawStorageKey: string; rawSha256: Buffer },
  reviewerId: string,
) {
  const id = v7({ msecs: new Date('2002-01-01T00:00:00.000Z').getTime() })
  await using transaction = await beginTransaction()
  const mediaTypeId = await upsertMediaTypes('message/rfc822', { query: transaction })
  const storageObjectId = await upsertCopyrightStorageObjectId(receipt.rawStorageKey, transaction)
  await transaction(sql`/* seedActiveOldCopyrightReceiptIntake */
    INSERT INTO copyright_notice_email_intakes
      (id, amazon_ses_message_id, received_at, raw_storage_object_id, raw_sha256,
       raw_media_type_id, raw_byte_size, spf_verdict, dkim_verdict, dmarc_verdict,
       spam_verdict, virus_verdict)
    VALUES (${receipt.id}, ${receipt.sesMessageId}, ${new Date('2001-01-01T00:00:00.000Z')},
      ${storageObjectId}, ${receipt.rawSha256}, ${mediaTypeId}, 12,
      'pass', 'pass', 'pass', 'pass', 'pass')`)
  await transaction(sql`/* seedOldCopyrightReceiptRationale */
    INSERT INTO copyright_decision_rationales
      (id, copyright_notice_email_intake_receipt_id, recorded_by_id, tool_name, rationale_ciphertext)
    VALUES (${id}, ${receipt.id}, ${reviewerId}, 'review_copyright_email_intake', 'v1:attempt')`)
  // This fixture owns no S3 object or parse children. Admit the rationale while its source is
  // live, then commit the guarded retained-receipt state consumed by review retirement.
  await runSequentially([
    () =>
      transaction(sql`/* seedOldCopyrightReceiptRationale:erasedReceipt */
      UPDATE copyright_notice_email_intake_receipts SET erased_at = reviewed_at WHERE id = ${receipt.id}`),
    () =>
      transaction(sql`/* seedOldCopyrightReceiptRationale:retentionPermit */
      SELECT set_config('app.copyright_operational_retention', 'on', true)`),
    () =>
      transaction(sql`/* seedOldCopyrightReceiptRationale:removePrivateIntake */
      DELETE FROM copyright_notice_email_intakes WHERE id = ${receipt.id}`),
  ])
  await transaction.commit()
  return id
}

export async function retireOldCopyrightReceiptRationale(id: string) {
  const cutoff = new Date('2010-01-01T00:00:00.000Z')
  await using transaction = await beginTransaction()
  await transaction(sql`/* authorizeOldCopyrightReceiptRationaleRetirement */
    SELECT set_config('app.copyright_rationale_retention_cutoff', ${cutoff.toISOString()}, true)`)
  const result = await transaction(sql`/* retireOldCopyrightReceiptRationale */
    DELETE FROM copyright_decision_rationales target
    WHERE target.id = ${id}
      AND fn_copyright_decision_rationale_retention_eligible(target, ${cutoff})`)
  await transaction.commit()
  return result.rowCount ?? 0
}

export async function seedReleasedCopyrightReceiptHold(input: {
  receiptId: string
  staffId: string
  releasedAt: Date
}) {
  await write(sql`/* seedReleasedCopyrightReceiptHold */
    INSERT INTO copyright_email_receipt_preservation_holds
      (id, copyright_notice_email_intake_receipt_id, kind, placed_by_id, released_at, released_by_id)
    VALUES (${v7({ msecs: input.releasedAt.getTime() - 86_400_000 })}, ${input.receiptId},
      'court_request', ${input.staffId}, ${input.releasedAt}, ${input.staffId})`)
}

export async function isCopyrightReceiptReviewRetirementEligible(
  receiptId: string,
): Promise<boolean> {
  const { rows } = await read<{
    eligible: boolean
  }>(sql`/* isCopyrightReceiptReviewRetirementEligible */
    SELECT fn_copyright_receipt_review_retirement_eligible(${receiptId}) AS eligible`)
  return rows[0]?.eligible ?? false
}

/** Put this test's default-infinity candidates ahead of the dirty database's due receipts. */
export async function copyrightReceiptReviewFixturePriority(): Promise<Date> {
  const { rows } = await read<{ reviewed_at: Date }>(sql`/* copyrightReceiptReviewFixturePriority */
    SELECT reviewed_at FROM copyright_notice_email_intake_receipts
    WHERE review_decision IS NOT NULL AND review_retirement_check_at = '-infinity'::timestamptz
      AND reviewed_at > '-infinity'::timestamptz
      AND reviewed_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - make_interval(years => 6)) AT TIME ZONE 'UTC'
    ORDER BY reviewed_at, id LIMIT 1`)
  return new Date(
    Math.min(
      new Date('2001-01-01T00:00:00.000Z').getTime(),
      rows[0]?.reviewed_at.getTime() ?? Infinity,
    ) -
      2 * 86_400_000,
  )
}

export async function peekCopyrightReceiptReviewRetirementCandidate(
  before: Date,
): Promise<string | null> {
  const { rows } = await read<{
    id: string
  }>(sql`/* peekCopyrightReceiptReviewRetirementCandidate */
    SELECT id FROM copyright_notice_email_intake_receipts
    WHERE review_decision IS NOT NULL AND review_retirement_check_at <= ${before}
      AND reviewed_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - make_interval(years => 6)) AT TIME ZONE 'UTC'
    ORDER BY review_retirement_check_at, reviewed_at, id LIMIT 1`)
  return rows[0]?.id ?? null
}
