import type { TransactionQuery } from '@data-stores/psql/types'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { insertCopyrightDeliveryRecipient } from './delivery-intents.mts'
import type { CopyrightEmailIntakeDeliveryKind } from './delivery-types.mts'

export type CopyrightEmailIntakeResponseKind = 'rejected' | 'needs_information'

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
  const id = uuidv7()
  const deliveryKind: CopyrightEmailIntakeDeliveryKind = `email_intake_${input.responseKind}`
  await transaction(sql`/* createCopyrightEmailIntakeResponseInTransaction */
    INSERT INTO copyright_notice_delivery_intents (
      id, copyright_notice_email_intake_id, recipient_role, delivery_kind, channel,
      idempotency_key, body_ciphertext
    ) VALUES (
      ${id}, ${input.intakeId}, 'correspondent', ${deliveryKind}, 'email',
      ${`copyright-email-intake-response:${input.intakeId}`},
      ${encryptSecret(responseBody(input.responseKind, input.responseMessage), bodyPurpose(id))}
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

function responseBody(kind: CopyrightEmailIntakeResponseKind, responseMessage: string | null) {
  const prefix =
    kind === 'rejected'
      ? 'We could not accept your copyright notice.'
      : 'We need more information before we can evaluate your copyright notice.'
  return responseMessage ? `${prefix}\n\n${responseMessage.trim()}` : prefix
}
