import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function clearTestSupportInboundEmbeddingMarker(sesMessageId: string): Promise<void> {
  await write(sql`/* clearTestSupportInboundEmbeddingMarker */
    UPDATE support_inbound_email_receipts
    SET embedding_enqueued_at = NULL
    WHERE ses_message_id = ${sesMessageId}
  `)
}

export async function clearTestSupportInboundCustomerSupportMarkers(
  sesMessageId: string,
): Promise<void> {
  await write(sql`/* clearTestSupportInboundCustomerSupportMarkers */
    UPDATE support_inbound_email_receipts
    SET customer_support_enqueued_at = NULL, customer_support_completed_at = NULL
    WHERE ses_message_id = ${sesMessageId}
  `)
}

export async function completeTestSupportInboundCustomerSupportReceipt(
  sesMessageId: string,
): Promise<void> {
  await write(sql`/* completeTestSupportInboundCustomerSupportReceipt */
    UPDATE support_inbound_email_receipts
    SET customer_support_enqueued_at = CURRENT_TIMESTAMP,
        customer_support_completed_at = CURRENT_TIMESTAMP
    WHERE ses_message_id = ${sesMessageId}
  `)
}

export async function clearTestSupportInboundCustomerSupportCompletedAt(
  sesMessageId: string,
): Promise<void> {
  await write(sql`/* clearTestSupportInboundCustomerSupportCompletedAt */
    UPDATE support_inbound_email_receipts
    SET customer_support_completed_at = NULL
    WHERE ses_message_id = ${sesMessageId}
  `)
}
