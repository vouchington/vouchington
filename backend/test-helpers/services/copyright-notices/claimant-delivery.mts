import { read } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { createOutboundCopyrightCorrespondence } from '../../../services/copyright-notices/correspondence.mts'
import { createCopyrightDeliveryIntent } from '../../../services/copyright-notices/delivery-intents.mts'

/** Gives a hand-built notice the claimant email receipt that every real form filing records. */
export async function recordTestClaimantEmailReceipt(noticeId: string): Promise<string> {
  const claimantEmail = `tests+copyright-${crypto.randomUUID()}@voucha.ai`
  const correspondence = await createOutboundCopyrightCorrespondence({
    noticeId,
    submissionId: null,
    correspondenceKind: 'receipt',
    compositionKind: 'deterministic_template',
    bodyCiphertext: `receipt-${crypto.randomUUID()}`,
    draftedById: null,
  })
  await createCopyrightDeliveryIntent({
    noticeId,
    submissionId: null,
    correspondenceId: correspondence.id,
    recipientUserId: null,
    recipientRole: 'claimant',
    deliveryKind: 'claimant_receipt',
    channel: 'email',
    idempotencyKey: `copyright-notice:${noticeId}:claimant-email-receipt`,
    recipientEmail: claimantEmail,
  })
  return claimantEmail
}

export type TestInformationRequestIntent = {
  id: string
  state: string
  recipientEmail: string
  correspondenceId: string | null
  recipientRole: string
  channel: string
}

/** Every staff information-request delivery of a notice, with its retained recipient decrypted. */
export async function readTestInformationRequestIntents(
  noticeId: string,
): Promise<TestInformationRequestIntent[]> {
  const { rows } = await read<{
    id: string
    state: string
    email_ciphertext: string
    copyright_notice_correspondence_message_id: string | null
    recipient_role: string
    channel: string
  }>(sql`/* readTestInformationRequestIntents */
    SELECT intent.id, intent.state, recipient.email_ciphertext, intent.recipient_role, intent.channel,
      intent.copyright_notice_correspondence_message_id
    FROM copyright_notice_delivery_intents intent
    JOIN copyright_notice_delivery_recipients recipient
      ON recipient.copyright_notice_delivery_intent_id = intent.id
    WHERE intent.copyright_notice_id = ${noticeId}
      AND intent.delivery_kind = 'staff_information_request'
    ORDER BY intent.id
  `)
  return rows.map(row => ({
    id: row.id,
    state: row.state,
    recipientEmail: decryptSecret(row.email_ciphertext, `copyright-delivery-recipient:${row.id}`),
    correspondenceId: row.copyright_notice_correspondence_message_id,
    recipientRole: row.recipient_role,
    channel: row.channel,
  }))
}

export async function readTestCorrespondenceBodyCiphertext(
  correspondenceId: string,
): Promise<string> {
  const { rows } = await read<{
    body_ciphertext: string
  }>(sql`/* readTestCorrespondenceBodyCiphertext */
    SELECT body_ciphertext FROM copyright_notice_correspondence_messages
    WHERE id = ${correspondenceId}
  `)
  const row = rows[0]
  if (!row) throw new Error(`Copyright correspondence ${correspondenceId} disappeared`)
  return row.body_ciphertext
}
