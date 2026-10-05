// Test-only email intake setup uses the real copyright service paths.
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
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
export async function createParsedCopyrightEmailIntake(receivedAt = new Date()) {
  const intake = await createUnparsedCopyrightEmailIntake(receivedAt)
  await recordCopyrightEmailParse(intake, {
    status: 'succeeded',
    fromEmail: `claimant-${crypto.randomUUID()}@example.test`,
    subject: 'Copyright complaint',
    bodyText: 'This is a copyright complaint.',
    messageId: `<${crypto.randomUUID()}@example.test>`,
    replyReferences: [],
    attachments: [],
  })
  return intake
}
