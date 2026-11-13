import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { createTestGuestEuCase } from './copyright-eu-guest-cases.mts'
import { seedCommittedTerritorialAcknowledgment } from './copyright-territorial-acknowledged-fixture.mts'
import { seedCommittedTerritorialDecision } from './copyright-territorial-committed-decision.mts'
import {
  createCopyrightEmailIntake,
  copyrightEmailIntakePurpose,
} from '../services/copyright-notices/email-intakes.mts'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from './services/copyright-notices/email-ses-verdicts.mts'
import {
  buildCopyrightEmailThreadReferenceRows,
  encryptCopyrightEmailReplyHeaders,
} from '../services/copyright-notices/email-thread-references.mts'
import {
  resolveCopyrightEmailThreadTokenIds,
  insertResolvedCopyrightEmailThreadReferences,
} from '../services/copyright-notices/email-thread-ancestors.mts'
import { createCopyrightEmailIntakeResponseInTransaction } from '../services/copyright-notices/email-intake-reply.mts'
import { linkCopyrightEmailIntakeToNotice } from './copyright-email-intake-link.mts'
import { isCopyrightIntakeEnabled } from '../services/copyright-notices/activation.mts'

/** Guest identity and encrypted notifier receipt remain genuine; only acknowledgment/decision are prerequisites. */
export async function createCommittedRetainedGuestCase() {
  const scene = await createTestGuestEuCase('pending')
  await seedCommittedTerritorialAcknowledgment('eu_dsa', scene.noticeId)
  await seedCommittedTerritorialDecision('eu_dsa', scene.staff, scene.noticeId, {
    text: `Decision ${scene.suffix}`,
    publicExplanation: `Public explanation ${scene.suffix}`,
    outcome: 'no_action',
    targets: [],
  })
  return scene
}

/** Complete owned parsed email/reference/receipt facts before the real guest complaint actor. */
export async function createCommittedGuestComplaintEmail(noticeId: string, senderEmail: string) {
  const sesMessageId = `ses-territorial-complaint-${crypto.randomUUID()}`
  const receivedAt = new Date()
  const { intake } = await createCopyrightEmailIntake({
    sesMessageId,
    receivedAt,
    rawStorageKey: `email/${sesMessageId}/original.eml`,
    rawSha256: Buffer.alloc(32, 3),
    rawMimeType: 'message/rfc822',
    rawByteSize: 12,
    sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
  })
  const purpose = copyrightEmailIntakePurpose(sesMessageId)
  const messageId = `<${crypto.randomUUID()}@example.test>`
  const headers = { inReplyTo: [], references: [] }
  await using transaction = await beginTransaction()
  await transaction(sql`/* createCommittedGuestComplaintEmail:parse */ INSERT INTO copyright_notice_email_intake_parses
    (copyright_notice_email_intake_id,status,sender_email_ciphertext,subject_ciphertext,body_ciphertext,message_id_ciphertext,reply_references_ciphertext)
    VALUES (${intake.id},'succeeded',${encryptSecret(senderEmail, purpose)},${encryptSecret('Re: EU copyright notice decision', purpose)},
      ${encryptSecret('I ask staff to reconsider the decision.', purpose)},${encryptSecret(messageId, purpose)},${encryptCopyrightEmailReplyHeaders(headers, purpose)})`)
  const references = buildCopyrightEmailThreadReferenceRows({ messageId, ...headers })
  const tokens = await resolveCopyrightEmailThreadTokenIds(
    transaction,
    references.map(row => row.lookup_digest),
  )
  await insertResolvedCopyrightEmailThreadReferences(transaction, intake.id, references, tokens)
  if (isCopyrightIntakeEnabled())
    await createCopyrightEmailIntakeResponseInTransaction(
      {
        intakeId: intake.id,
        recipientEmail: senderEmail,
        responseKind: 'received',
        responseMessage: null,
      },
      transaction,
    )
  const linked = await linkCopyrightEmailIntakeToNotice(
    { intakeId: intake.id, noticeId, linkKind: 'thread' },
    transaction,
  )
  if (!linked) throw new Error('Owned guest complaint email did not retain its case thread')
  await transaction.commit()
  return intake
}
