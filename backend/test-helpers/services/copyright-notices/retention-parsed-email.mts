import { randomBytes, randomUUID } from 'node:crypto'
import { createCopyrightEmailIntake } from '../../../services/copyright-notices/index.mts'
import type { PrivateUser } from '../../../services/users/types.mts'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from './email-ses-verdicts.mts'
import { beginTransaction } from '@data-stores/psql'
import {
  buildCopyrightEmailThreadReferenceRows,
  encryptCopyrightEmailReplyHeaders,
} from '../../../services/copyright-notices/email-thread-references.mts'
import {
  insertResolvedCopyrightEmailThreadReferences,
  resolveCopyrightEmailThreadTokenIds,
} from '../../../services/copyright-notices/email-thread-ancestors.mts'
import { copyrightEmailIntakePurpose } from '../../../services/copyright-notices/email-intakes.mts'
import { insertCopyrightEmailAttachments } from '../../../services/copyright-notices/email-intake-attachments.mts'
import { createCopyrightEmailIntakeResponseInTransaction } from '../../../services/copyright-notices/email-intake-reply.mts'
import { isCopyrightIntakeEnabled } from '../../../services/copyright-notices/activation.mts'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'

/** A real intake and reference fact for setup that does not run the threading service. */
export async function createRetentionThreadSeedEmail(
  label: string,
  options: { messageId: string; sesMessageId?: string },
) {
  const sesMessageId = options.sesMessageId ?? `ses-${label}-${randomUUID()}`
  const { intake } = await createCopyrightEmailIntake({
    sesMessageId,
    receivedAt: new Date(),
    rawStorageKey: `email/${sesMessageId}/original.eml`,
    rawSha256: randomBytes(32),
    rawMimeType: 'message/rfc822',
    rawByteSize: 12,
    sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
  })
  await using transaction = await beginTransaction()
  const rows = buildCopyrightEmailThreadReferenceRows({
    messageId: options.messageId,
    inReplyTo: [],
    references: [],
  })
  const tokens = await resolveCopyrightEmailThreadTokenIds(
    transaction,
    rows.map(row => row.lookup_digest),
  )
  await insertResolvedCopyrightEmailThreadReferences(transaction, intake.id, rows, tokens)
  await transaction.commit()
  return intake
}

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
export async function createRetentionParsedEmail(
  label: string,
  options: { reply?: boolean; messageId?: string; sesMessageId?: string } = {},
) {
  const sesMessageId = options.sesMessageId ?? `ses-${label}-${randomUUID()}`
  const senderEmail = `sender-${randomUUID()}@example.test`
  const messageId = options.messageId ?? `<${randomUUID()}@example.test>`
  const replyReferences = options.reply ? [`<${randomUUID()}@example.test>`] : []
  const { intake } = await createCopyrightEmailIntake({
    sesMessageId,
    receivedAt: new Date(),
    rawStorageKey: `email/${sesMessageId}/original.eml`,
    rawSha256: randomBytes(32),
    rawMimeType: 'message/rfc822',
    rawByteSize: 12,
    sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
  })
  const purpose = copyrightEmailIntakePurpose(sesMessageId)
  await using transaction = await beginTransaction()
  await transaction(sql`/* createRetentionParsedEmail:parse */
    INSERT INTO copyright_notice_email_intake_parses (
      copyright_notice_email_intake_id, status, sender_email_ciphertext,
      sender_name_ciphertext, subject_ciphertext, body_ciphertext, message_id_ciphertext,
      reply_references_ciphertext
    ) VALUES (
      ${intake.id}, 'succeeded', ${encryptSecret(senderEmail, purpose)},
      ${encryptSecret('Sender Name', purpose)}, ${encryptSecret(`Subject ${label}`, purpose)},
      ${encryptSecret(`Body of ${label}`, purpose)}, ${encryptSecret(messageId, purpose)},
      ${encryptCopyrightEmailReplyHeaders({ inReplyTo: [], references: replyReferences }, purpose)}
    )`)
  await insertCopyrightEmailAttachments(
    transaction,
    intake.id,
    [
      {
        filename: 'evidence.png',
        contentId: `cid-${randomUUID()}`,
        mimeType: 'image/png',
        byteSize: 10,
        sha256: randomBytes(32),
      },
    ],
    purpose,
  )
  const rows = buildCopyrightEmailThreadReferenceRows({
    messageId,
    inReplyTo: [],
    references: replyReferences,
  })
  const tokens = await resolveCopyrightEmailThreadTokenIds(
    transaction,
    rows.map(row => row.lookup_digest),
  )
  await insertResolvedCopyrightEmailThreadReferences(transaction, intake.id, rows, tokens)
  if (!options.reply && isCopyrightIntakeEnabled())
    await createCopyrightEmailIntakeResponseInTransaction(
      {
        intakeId: intake.id,
        recipientEmail: senderEmail,
        responseKind: 'received',
        responseMessage: null,
      },
      transaction,
    )
  await transaction.commit()
  return intake
}
