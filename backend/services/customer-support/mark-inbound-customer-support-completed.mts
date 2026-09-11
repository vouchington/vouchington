import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function markInboundCustomerSupportCompleted(
  threadId: string,
  messageId: string,
  completedAt: Date,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* markInboundCustomerSupportCompleted */
    UPDATE support_inbound_email_receipts
    SET customer_support_enqueued_at = COALESCE(customer_support_enqueued_at, ${completedAt}),
        customer_support_completed_at = ${completedAt}
    WHERE support_thread_id = ${threadId}
      AND support_message_id = ${messageId}
      AND customer_support_completed_at IS NULL
  `)
}
