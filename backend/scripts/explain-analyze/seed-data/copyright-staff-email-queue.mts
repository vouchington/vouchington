import { beginTransaction, write } from '@data-stores/psql'
import { upsertMediaTypes } from '@services/urls/media-types'
import { v7 as uuidv7 } from 'uuid'
import { seedUser } from '../run-support.mts'

const BACKGROUND_ROWS = 6000
const CHUNK_SIZE = 1000
export const STAFF_EMAIL_QUEUE_RECEIVED_AT = '2000-01-01T00:00:00.123456Z'

export async function seedCopyrightStaffEmailQueue(eligibleCount: number) {
  const foregroundIds = Array.from({ length: eligibleCount * 2 }, () => uuidv7()).toSorted()
  const eligibleIds = foregroundIds.filter((_, index) => index % 2 === 0)
  const ids = [...foregroundIds, ...Array.from({ length: BACKGROUND_ROWS }, () => uuidv7())]
  const tokenId = uuidv7()
  const [ancestorId, replyId] = eligibleIds
  const reviewedIds = []
  const erasedIds = []
  const withoutPointerIds = []
  for (const [index, id] of ids.entries()) {
    if (index < foregroundIds.length && index % 2 === 0) continue
    const group = Math.floor(index / 2) % 3
    if (group === 0) reviewedIds.push(id)
    if (group === 1) erasedIds.push(id)
    if (group === 2) withoutPointerIds.push(id)
  }

  await using transaction = await beginTransaction()
  const mediaTypeId = await upsertMediaTypes('message/rfc822', { query: transaction })

  // Seed the read-only corpus in batches without intake ingestion or delivery side effects.
  for (let start = 0; start < ids.length; start += CHUNK_SIZE) {
    const batch = ids.slice(start, start + CHUNK_SIZE)
    await transaction(
      `/* seedCopyrightStaffEmailQueueStorage */
      INSERT INTO copyright_notice_storage_objects (storage_key)
      SELECT 'explain-staff-email-queue/' || id FROM unnest($1::uuid[]) AS fixture(id)`,
      [batch],
    )
    await transaction(
      `/* seedCopyrightStaffEmailQueueReceipts */
      INSERT INTO copyright_notice_email_intake_receipts
        (id, amazon_ses_message_id, raw_sha256, raw_storage_key_sha256, raw_byte_size)
      SELECT id, 'explain-staff-email-queue/' || id, sha256(uuid_send(id)),
        sha256(convert_to('explain-staff-email-queue/' || id, 'UTF8')), 1
      FROM unnest($1::uuid[]) AS fixture(id)`,
      [batch],
    )
    await transaction(
      `/* seedCopyrightStaffEmailQueueIntakes */
      INSERT INTO copyright_notice_email_intakes
        (id, amazon_ses_message_id, received_at, raw_storage_object_id, raw_sha256, raw_media_type_id,
         raw_byte_size, spf_verdict, dkim_verdict, dmarc_verdict, spam_verdict, virus_verdict)
      SELECT receipt.id, receipt.amazon_ses_message_id,
        CASE WHEN receipt.id = ANY($2::uuid[]) THEN $3::timestamptz ELSE '2001-01-01'::timestamptz END,
        object.id, receipt.raw_sha256, $4::bigint, 1, 'pass', 'pass', 'pass', 'pass', 'pass'
      FROM copyright_notice_email_intake_receipts receipt
      JOIN copyright_notice_storage_objects object ON object.storage_key = receipt.amazon_ses_message_id
      WHERE receipt.id = ANY($1::uuid[])`,
      [batch, foregroundIds, STAFF_EMAIL_QUEUE_RECEIVED_AT, mediaTypeId],
    )
  }
  await transaction(
    `/* seedCopyrightStaffEmailQueueReviewedReceipts */
    UPDATE copyright_notice_email_intake_receipts
    SET review_decision = 'rejected', reviewed_at = CURRENT_TIMESTAMP, reviewed_by_id = $1::uuid,
      review_rationale_ciphertext = 'explain-fixture'
    WHERE id = ANY($2::uuid[])`,
    [seedUser.id, reviewedIds],
  )
  await transaction(
    `/* seedCopyrightStaffEmailQueueErasedReceipts */
    UPDATE copyright_notice_email_intake_receipts SET erased_at = CURRENT_TIMESTAMP
    WHERE id = ANY($1::uuid[])`,
    [erasedIds],
  )
  // Retention first clears the evidence pointer; test that guard independently of erased_at.
  await transaction(
    `/* permitCopyrightStaffEmailQueuePointerErasure */
    SELECT set_config('app.copyright_retention_erasure', 'on', true)`,
  )
  await transaction(
    `/* seedCopyrightStaffEmailQueueClearedPointers */
    UPDATE copyright_notice_email_intakes SET raw_storage_object_id = NULL WHERE id = ANY($1::uuid[])`,
    [withoutPointerIds],
  )
  await transaction(
    `/* seedCopyrightStaffEmailQueueThreadToken */
    INSERT INTO copyright_notice_email_thread_tokens (id, lookup_digest)
    VALUES ($1::uuid, encode(sha256(uuid_send($1::uuid)), 'hex'))`,
    [tokenId],
  )
  await transaction(
    `/* seedCopyrightStaffEmailQueueThreadReferences */
    INSERT INTO copyright_notice_email_thread_references
      (copyright_notice_email_intake_id, token_id, reference_kind)
    VALUES ($1::uuid, $3::uuid, 'message_id'), ($2::uuid, $3::uuid, 'in_reply_to')`,
    [ancestorId, replyId, tokenId],
  )
  await transaction(
    `/* seedCopyrightStaffEmailQueueThreadEdge */
    INSERT INTO copyright_notice_email_message_ancestors
      (reply_message_intake_receipt_id, ancestor_message_intake_receipt_id, reference_kind)
    VALUES ($1::uuid, $2::uuid, 'in_reply_to')`,
    [replyId, ancestorId],
  )
  await transaction.commit()

  return {
    eligibleIds,
    replyId,
    seededRows: ids.length,
    cleanup: async () => {
      await using cleanup = await beginTransaction()
      await cleanup(`/* permitCopyrightStaffEmailQueueCleanup */
        SELECT set_config('app.copyright_operational_retention', 'on', true)`)
      await cleanup(
        `/* deleteCopyrightStaffEmailQueueThreadEdge */
        DELETE FROM copyright_notice_email_message_ancestors WHERE reply_message_intake_receipt_id = $1::uuid`,
        [replyId],
      )
      await cleanup(
        `/* deleteCopyrightStaffEmailQueueThreadReferences */
        DELETE FROM copyright_notice_email_thread_references WHERE token_id = $1::uuid`,
        [tokenId],
      )
      await cleanup(
        `/* deleteCopyrightStaffEmailQueueThreadToken */
        DELETE FROM copyright_notice_email_thread_tokens WHERE id = $1::uuid`,
        [tokenId],
      )
      await cleanup(
        `/* deleteCopyrightStaffEmailQueueIntakes */
        DELETE FROM copyright_notice_email_intakes WHERE id = ANY($1::uuid[])`,
        [ids],
      )
      await cleanup(
        `/* deleteCopyrightStaffEmailQueueStorage */
        DELETE FROM copyright_notice_storage_objects WHERE storage_key = ANY($1::text[])`,
        [ids.map(id => `explain-staff-email-queue/${id}`)],
      )
      // Replay receipts survive operational retention. Mark the owned receipts erased.
      await cleanup(
        `/* markCopyrightStaffEmailQueueReceiptsErased */
        UPDATE copyright_notice_email_intake_receipts SET erased_at = CURRENT_TIMESTAMP
        WHERE id = ANY($1::uuid[]) AND erased_at IS NULL`,
        [ids],
      )
      await cleanup.commit()
      await write(`/* analyzeCleanedCopyrightStaffEmailQueue */
        ANALYZE copyright_notice_email_intakes, copyright_notice_email_intake_receipts,
          copyright_notice_email_thread_references, copyright_notice_email_message_ancestors`)
    },
  }
}
