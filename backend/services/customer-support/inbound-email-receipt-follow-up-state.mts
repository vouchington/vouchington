import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type InboundReceiptFollowUpState = {
  embeddingEnqueued: boolean
  customerSupportEnqueued: boolean
  customerSupportCompleted: boolean
}

export async function getInboundReceiptFollowUpState(
  threadId: string,
  messageId: string,
  options: QueryOptions,
): Promise<InboundReceiptFollowUpState> {
  const { rows } = await write(
    sql`/* getInboundReceiptFollowUpState */
      SELECT COALESCE(BOOL_OR(embedding_enqueued_at IS NOT NULL), FALSE) AS embedding_enqueued,
             COALESCE(BOOL_OR(customer_support_enqueued_at IS NOT NULL), FALSE) AS customer_support_enqueued,
             COALESCE(BOOL_OR(customer_support_completed_at IS NOT NULL), FALSE) AS customer_support_completed
      FROM support_inbound_email_receipts
      WHERE support_thread_id = ${threadId} AND support_message_id = ${messageId}
    `,
    options,
  )
  const state = rows[0] as
    | {
        embedding_enqueued: boolean
        customer_support_enqueued: boolean
        customer_support_completed: boolean
      }
    | undefined
  return {
    embeddingEnqueued: state?.embedding_enqueued ?? false,
    customerSupportEnqueued: state?.customer_support_enqueued ?? false,
    customerSupportCompleted: state?.customer_support_completed ?? false,
  }
}
