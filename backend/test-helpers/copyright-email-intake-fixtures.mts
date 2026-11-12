// Test-only email intake setup uses the real copyright service paths.
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { beginTransaction, write } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import { copyrightEmailIntakePurpose } from '../services/copyright-notices/email-intakes.mts'
import {
  buildCopyrightEmailThreadReferenceRows,
  encryptCopyrightEmailReplyHeaders,
} from '../services/copyright-notices/email-thread-references.mts'
import { insertCopyrightEmailThreadReferences } from '../services/copyright-notices/email-thread-ancestors.mts'
import sql from 'sql-template-strings'
import {
  createCopyrightEmailIntake,
  recordCopyrightEmailParse,
} from '../services/copyright-notices/index.mts'

// A received copyright email whose parse was never recorded, as when the SES worker keeps failing.
export async function createUnparsedCopyrightEmailIntake(
  receivedAt = new Date(),
  sesMessageId = `ses-email-${crypto.randomUUID()}`,
) {
  const { intake } = await createCopyrightEmailIntake({
    sesMessageId,
    receivedAt,
    rawStorageKey: `email/${sesMessageId}/original.eml`,
    rawSha256: Buffer.alloc(32, 8),
    rawMimeType: 'message/rfc822',
    rawByteSize: 12,
    sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
  })
  return intake
}

// A received copyright email whose MIME parse succeeded, so it awaits staff review.
export async function createParsedCopyrightEmailIntake(
  receivedAt = new Date(),
  fromEmail = `claimant-${crypto.randomUUID()}@example.test`,
  sesMessageId?: string,
) {
  const intake = await createUnparsedCopyrightEmailIntake(receivedAt, sesMessageId)
  await recordCopyrightEmailParse(intake, {
    status: 'succeeded',
    fromEmail,
    subject: 'Copyright complaint',
    bodyText: 'This is a copyright complaint.',
    messageId: `<${crypto.randomUUID()}@example.test>`,
    replyReferences: [],
    attachments: [],
  })
  return intake
}

/** Inspect only the intake and placement owned by one promotion-race test. */
export async function readCopyrightEmailPromotionEffects(intakeId: string, placementId: string) {
  const { rows } = await write<{
    reviews: number
    evidence: number
    deliveries: number
    thread_reviews: number
    notice_targets: number
  }>(sql`/* readCopyrightEmailPromotionEffects */
    SELECT
      (SELECT count(*)::int FROM copyright_notice_email_intake_reviews
       WHERE copyright_notice_email_intake_receipt_id = ${intakeId}) AS reviews,
      (SELECT count(*)::int FROM copyright_notice_evidence_artifacts
       WHERE storage_object_id = (
         SELECT raw_storage_object_id FROM copyright_notice_email_intakes WHERE id = ${intakeId}
       )) AS evidence,
      (SELECT count(*)::int FROM copyright_notice_delivery_work_items
       WHERE copyright_notice_email_intake_receipt_id = ${intakeId}) AS deliveries,
      (SELECT count(*)::int FROM copyright_notice_email_intake_notice_links
       WHERE copyright_notice_email_intake_id = ${intakeId}
         AND correspondence_action IS NOT NULL) AS thread_reviews,
      (SELECT count(*)::int FROM copyright_notice_targets
       WHERE placement_id = ${placementId}) AS notice_targets
  `)
  return rows[0]!
}

/** Owned unmatched reply state for UI tests; ingestion is not their subject. */
export async function seedUnmatchedCopyrightEmailReply() {
  const intake = await createUnparsedCopyrightEmailIntake()
  const purpose = copyrightEmailIntakePurpose(intake.amazon_ses_message_id)
  const messageId = `<${crypto.randomUUID()}@example.test>`
  const headers = { inReplyTo: [`<${crypto.randomUUID()}@example.test>`], references: [] }
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedUnmatchedCopyrightEmailReply:parse */
    INSERT INTO copyright_notice_email_intake_parses (
      copyright_notice_email_intake_id, status, sender_email_ciphertext,
      subject_ciphertext, body_ciphertext, message_id_ciphertext, reply_references_ciphertext
    ) VALUES (${intake.id}, 'succeeded', ${encryptSecret('claimant@example.test', purpose)},
      ${encryptSecret('Copyright reply', purpose)}, ${encryptSecret('Owned reply.', purpose)},
      ${encryptSecret(messageId, purpose)}, ${encryptCopyrightEmailReplyHeaders(headers, purpose)})`)
  await insertCopyrightEmailThreadReferences(
    transaction,
    intake.id,
    buildCopyrightEmailThreadReferenceRows({ messageId, ...headers }),
  )
  await transaction.commit()
  return intake
}
