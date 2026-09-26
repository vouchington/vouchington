// Email intake fixtures belong in the copyright service test support, beside the route fixtures.
import { createCopyrightEmailIntake, recordCopyrightEmailParse } from './index.mts'

// A received copyright email whose MIME parse succeeded, so it awaits staff review.
export async function createParsedCopyrightEmailIntake(receivedAt = new Date()) {
  const sesMessageId = `ses-parsed-${crypto.randomUUID()}`
  const { intake } = await createCopyrightEmailIntake({
    sesMessageId,
    receivedAt,
    rawStorageKey: `email/${sesMessageId}/original.eml`,
    rawSha256: Buffer.alloc(32, 8),
    rawMimeType: 'message/rfc822',
    rawByteSize: 12,
  })
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
