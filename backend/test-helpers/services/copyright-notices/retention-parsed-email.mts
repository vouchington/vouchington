import { randomBytes, randomUUID } from 'node:crypto'
import {
  createCopyrightEmailIntake,
  recordCopyrightEmailParse,
} from '../../../services/copyright-notices/index.mts'
import type { PrivateUser } from '../../../services/users/types.mts'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from './email-ses-verdicts.mts'

/** What a retention fixture hands back: the notice, a staff user, and the bucket keys it holds. */
export type RetentionCase = {
  noticeId: string
  moderator: PrivateUser
  posterId: string
  /** Evidence-bucket keys only this case references. */
  evidenceKeys: string[]
}

/**
 * A received, parsed email with an attachment, as the SES worker stores it. A reply carries a
 * reference to the message it answers, so it waits to be linked to its root case.
 */
export async function createRetentionParsedEmail(label: string, options: { reply?: boolean } = {}) {
  const sesMessageId = `ses-${label}-${randomUUID()}`
  const { intake } = await createCopyrightEmailIntake({
    sesMessageId,
    receivedAt: new Date(),
    rawStorageKey: `email/${sesMessageId}/original.eml`,
    rawSha256: randomBytes(32),
    rawMimeType: 'message/rfc822',
    rawByteSize: 12,
    sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
  })
  await recordCopyrightEmailParse(intake, {
    status: 'succeeded',
    fromEmail: `sender-${randomUUID()}@example.test`,
    fromName: 'Sender Name',
    subject: `Subject ${label}`,
    bodyText: `Body of ${label}`,
    messageId: `<${randomUUID()}@example.test>`,
    replyReferences: options.reply ? [`<${randomUUID()}@example.test>`] : [],
    attachments: [
      {
        filename: 'evidence.png',
        contentId: `cid-${randomUUID()}`,
        mimeType: 'image/png',
        byteSize: 10,
        sha256: randomBytes(32),
      },
    ],
  })
  return intake
}
