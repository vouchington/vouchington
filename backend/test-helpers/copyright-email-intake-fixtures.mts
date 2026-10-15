// Test-only email intake setup uses the real copyright service paths.
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  createCopyrightEmailIntake,
  recordCopyrightEmailParse,
} from '../services/copyright-notices/index.mts'

// A received copyright email whose parse was never recorded, as when the SES worker keeps failing.
export async function createUnparsedCopyrightEmailIntake(receivedAt = new Date()) {
  const sesMessageId = `ses-email-${crypto.randomUUID()}`
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
) {
  const intake = await createUnparsedCopyrightEmailIntake(receivedAt)
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
       WHERE copyright_notice_email_intake_id = ${intakeId}) AS reviews,
      (SELECT count(*)::int FROM copyright_notice_evidence_artifacts
       WHERE storage_object_id = (
         SELECT raw_storage_object_id FROM copyright_notice_email_intakes WHERE id = ${intakeId}
       )) AS evidence,
      (SELECT count(*)::int FROM copyright_notice_delivery_work_items
       WHERE copyright_notice_email_intake_id = ${intakeId}) AS deliveries,
      (SELECT count(*)::int FROM copyright_notice_email_correspondence_reviews
       WHERE copyright_notice_email_intake_id = ${intakeId}) AS thread_reviews,
      (SELECT count(*)::int FROM copyright_notice_targets
       WHERE placement_id = ${placementId}) AS notice_targets
  `)
  return rows[0]!
}
