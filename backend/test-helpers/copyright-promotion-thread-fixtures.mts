import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import {
  createCopyrightEmailIntake,
  copyrightEmailIntakePurpose,
} from '../services/copyright-notices/email-intakes.mts'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from './services/copyright-notices/email-ses-verdicts.mts'
import {
  buildCopyrightEmailThreadReferenceRows,
  encryptCopyrightEmailReplyHeaders,
  normalizedCopyrightEmailReplyValues,
} from '../services/copyright-notices/email-thread-references.mts'
import {
  resolveCopyrightEmailThreadTokenIds,
  insertResolvedCopyrightEmailThreadReferences,
  recordCopyrightEmailAncestorEdges,
} from '../services/copyright-notices/email-thread-ancestors.mts'
import {
  copyrightEmailMessageIdIsAmbiguous,
  findCopyrightEmailThreadMatch,
  type CopyrightEmailThreadMatch,
} from '../services/copyright-notices/email-thread-match.mts'
import { insertCopyrightEmailIntakeNoticeLink } from '../services/copyright-notices/email-thread-link.mts'
import { createCopyrightEmailIntakeResponseInTransaction } from '../services/copyright-notices/email-intake-reply.mts'
import { isCopyrightIntakeEnabled } from '../services/copyright-notices/activation.mts'

/** Complete ordinary parsed/reference/derived setup; promotion and receipt actors remain real subjects. */
export async function seedCopyrightPromotionThreadSource(input: {
  messageId: string | null
  inReplyTo?: string[]
  replyReferences?: string[]
  bodyText?: string
}) {
  const sesMessageId = `ses-thread-${crypto.randomUUID()}`
  const { intake } = await createCopyrightEmailIntake({
    sesMessageId,
    receivedAt: new Date(),
    rawStorageKey: `email/${sesMessageId}/original.eml`,
    rawSha256: Buffer.alloc(32, 4),
    rawMimeType: 'message/rfc822',
    rawByteSize: 24,
    sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
  })
  const purpose = copyrightEmailIntakePurpose(intake.amazon_ses_message_id)
  const sender = `claimant-${crypto.randomUUID()}@example.test`
  const headers = { inReplyTo: input.inReplyTo ?? [], references: input.replyReferences ?? [] }
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedCopyrightPromotionThreadEmail:parse */
    INSERT INTO copyright_notice_email_intake_parses (copyright_notice_email_intake_id, status,
      sender_email_ciphertext, subject_ciphertext, body_ciphertext, message_id_ciphertext, reply_references_ciphertext)
    VALUES (${intake.id}, 'succeeded', ${encryptSecret(sender, purpose)}, ${encryptSecret('Copyright notice', purpose)},
      ${encryptSecret(input.bodyText ?? 'Threaded copyright email.', purpose)},
      ${input.messageId ? encryptSecret(input.messageId, purpose) : null}, ${encryptCopyrightEmailReplyHeaders(headers, purpose)})`)
  if (
    headers.inReplyTo.length === 0 &&
    headers.references.length === 0 &&
    isCopyrightIntakeEnabled()
  )
    await createCopyrightEmailIntakeResponseInTransaction(
      {
        intakeId: intake.id,
        recipientEmail: sender,
        responseKind: 'received',
        responseMessage: null,
      },
      transaction,
    )
  const thread = { intakeId: intake.id, messageId: input.messageId, ...headers }
  const rows = buildCopyrightEmailThreadReferenceRows(thread)
  const tokens = await resolveCopyrightEmailThreadTokenIds(
    transaction,
    rows.map(row => row.lookup_digest),
  )
  await insertResolvedCopyrightEmailThreadReferences(transaction, intake.id, rows, tokens)
  await transaction.commit()
  return { intakeId: intake.id, thread, tokens }
}

/** Complete derivation is a prerequisite only; real derivation/promotion subjects use the public actor. */
export async function seedCopyrightPromotionThreadEmail(
  input: Parameters<typeof seedCopyrightPromotionThreadSource>[0],
) {
  const { intakeId, thread, tokens } = await seedCopyrightPromotionThreadSource(input)
  await using transaction = await beginTransaction()
  let match: CopyrightEmailThreadMatch | null = null
  if (!(await copyrightEmailMessageIdIsAmbiguous(transaction, intakeId))) {
    await recordCopyrightEmailAncestorEdges(transaction, intakeId)
    match = await findCopyrightEmailThreadMatch(
      intakeId,
      normalizedCopyrightEmailReplyValues(thread),
      tokens,
      transaction,
    )
    if (
      match &&
      !(await insertCopyrightEmailIntakeNoticeLink(transaction, {
        intakeId,
        noticeId: match.noticeId,
        linkKind: 'thread',
        matchedReference: match.matchedReference,
      }))
    )
      throw new Error('Owned canonical thread link did not commit')
  }
  await transaction.commit()
  return { intakeId, match }
}
