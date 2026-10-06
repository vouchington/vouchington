import type { TransactionQuery } from '@data-stores/psql/types'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import {
  copyrightReceiptText,
  copyrightNeedsInformationText,
  copyrightIntakeRejectionText,
} from './statement-of-reasons-wording.mts'
import { insertCopyrightDeliveryRecipient } from './delivery-intents.mts'
import type { CopyrightEmailIntakeDeliveryKind } from './delivery-types.mts'

export type CopyrightEmailIntakeResponseKind = 'rejected' | 'needs_information' | 'received'

/**
 * Queues the one private reply to a declined email intake as a delivery intent with no case. The
 * rendered body is stored encrypted and immutable so every retry sends the same legal text, and the
 * recipient goes in the intent's recipient row so SES bounces match it like any other delivery.
 */
export async function createCopyrightEmailIntakeResponseInTransaction(
  input: {
    intakeId: string
    recipientEmail: string
    responseKind: CopyrightEmailIntakeResponseKind
    responseMessage: string | null
  },
  transaction: TransactionQuery,
): Promise<string> {
  const { rows } = await transaction<{
    received_at: Date
    ai_guidance: boolean
  }>(sql`/* createCopyrightEmailIntakeResponseInTransaction:facts */
    SELECT received_at, EXISTS (SELECT 1 FROM copyright_notice_email_intake_recommendations
      WHERE copyright_notice_email_intake_id = ${input.intakeId}) AS ai_guidance
    FROM copyright_notice_email_intakes WHERE id = ${input.intakeId}
  `)
  const rejectedText =
    input.responseKind === 'rejected'
      ? copyrightIntakeRejectionText(rows[0]!.received_at, rows[0]!.ai_guidance)
      : null
  const id = uuidv7()
  const deliveryKind: CopyrightEmailIntakeDeliveryKind = `email_intake_${input.responseKind}`
  await transaction(sql`/* createCopyrightEmailIntakeResponseInTransaction */
    INSERT INTO copyright_notice_delivery_work_items (
      id, copyright_notice_email_intake_id, recipient_role, delivery_kind, channel,
      idempotency_key, body_ciphertext
    ) VALUES (
      ${id}, ${input.intakeId}, 'correspondent', ${deliveryKind}, 'email',
      ${input.responseKind === 'received' ? `copyright-email-intake-receipt:${input.intakeId}` : `copyright-email-intake-response:${input.intakeId}`},
      ${encryptSecret(responseBody(input.responseKind, input.responseMessage, rejectedText), bodyPurpose(id))}
    )
  `)
  await insertCopyrightDeliveryRecipient(input.recipientEmail, id, transaction)
  return id
}

export function decryptCopyrightEmailIntakeResponseBody(
  intentId: string,
  bodyCiphertext: string,
): string {
  return decryptSecret(bodyCiphertext, bodyPurpose(intentId))
}

function bodyPurpose(intentId: string): string {
  return `copyright-delivery-body:${intentId}`
}

function responseBody(
  kind: CopyrightEmailIntakeResponseKind,
  responseMessage: string | null,
  rejectedText: string | null,
) {
  if (kind === 'received') return copyrightReceiptText()
  const prefix = kind === 'rejected' ? rejectedText! : copyrightNeedsInformationText
  return responseMessage ? `${prefix}\n\n${responseMessage.trim()}` : prefix
}
