import sql from 'sql-template-strings'
import { beginTransaction } from '@data-stores/psql'
import { createOutboundCopyrightCorrespondence } from '../services/copyright-notices/correspondence.mts'
import { createCopyrightDeliveryIntent } from '../services/copyright-notices/delivery-intents.mts'

/** A committed delivery prerequisite for participant projection and replay subjects. */
export async function seedCopyrightStaffReceiptDelivery(
  input: Parameters<typeof createCopyrightDeliveryIntent>[0],
) {
  await using transaction = await beginTransaction()
  const intent = await createCopyrightDeliveryIntent(input, transaction)
  await transaction.commit()
  return intent
}

/** Complete canonical receipt dependency, including its lifecycle event. */
export async function seedCopyrightStaffReceiptCorrespondence(
  input: Parameters<typeof createOutboundCopyrightCorrespondence>[0],
) {
  await using transaction = await beginTransaction()
  const correspondence = await createOutboundCopyrightCorrespondence(input, transaction)
  await transaction.commit()
  return correspondence
}

/** Commits the sent work and attempt facts required by outbound-reference threading subjects. */
export async function seedCopyrightStaffReceiptSent(input: {
  intentId: string
  leaseToken: string
  sesMessageId: string
}): Promise<boolean> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction(sql`/* seedCopyrightStaffReceiptSent */
    UPDATE copyright_notice_delivery_work_items SET sent_at = CURRENT_TIMESTAMP,
      amazon_ses_message_id = ${input.sesMessageId}
    WHERE id = ${input.intentId} AND state = 'claimed' AND lease_token = ${input.leaseToken}
      AND lease_expires_at > clock_timestamp()
    RETURNING id`)
  await transaction.commit()
  return rows.length === 1
}
