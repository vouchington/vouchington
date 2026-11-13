import { beginTransaction } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import type { CopyrightDeliveryRecipientRecord } from './delivery-types.mts'
import { readCopyrightDeliveryPreservationCoverage } from './delivery-preservation.mts'

export async function markCopyrightDeliveryIntentBouncedBySesMessageId(input: {
  sesMessageId: string
  recipientEmails: string[]
}): Promise<number> {
  await using transaction = await beginTransaction({ serializable: true })
  const { rows } = await transaction<CopyrightDeliveryRecipientRecord & { intent_id: string }>(
    sql`/* markCopyrightDeliveryIntentBouncedBySesMessageId:recipients */
      SELECT intent.id AS intent_id, recipient.copyright_notice_delivery_work_item_id, recipient.email_ciphertext
      FROM copyright_notice_delivery_work_items intent
      JOIN copyright_notice_delivery_recipients recipient
        ON recipient.copyright_notice_delivery_work_item_id = intent.id
      WHERE intent.amazon_ses_message_id = ${input.sesMessageId} AND intent.state = 'sent'`,
  )
  const bouncedRecipients = new Set(input.recipientEmails.map(normalizeEmailAddress))
  const intentIds = rows.flatMap(row => {
    const recipient = decryptSecret(
      row.email_ciphertext,
      `copyright-delivery-recipient:${row.copyright_notice_delivery_work_item_id}`,
    )
    return bouncedRecipients.has(normalizeEmailAddress(recipient)) ? [row.intent_id] : []
  })
  if (intentIds.length === 0) return 0
  await readCopyrightDeliveryPreservationCoverage(transaction, intentIds)
  const { rowCount } =
    await transaction(sql`/* markCopyrightDeliveryIntentBouncedBySesMessageId:update */
    UPDATE copyright_notice_delivery_work_items
    SET bounced_at = CURRENT_TIMESTAMP
    WHERE id = ANY(${intentIds}::uuid[]) AND state = 'sent'
  `)
  await transaction.commit()
  return rowCount ?? 0
}

function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase()
}
