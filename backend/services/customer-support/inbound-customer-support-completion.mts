import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function isInboundCustomerSupportCompleted(
  threadId: string,
  messageId: string,
  options: QueryOptions,
): Promise<boolean> {
  const logicalJobId = `support_inbound_email__${messageId}__customer_support`
  const { rows } = await write(
    sql`/* isInboundCustomerSupportCompleted */
      SELECT EXISTS (
        SELECT 1
        FROM support_agent_runs
        WHERE idempotency_key = ${logicalJobId}
          AND support_thread_id = ${threadId}
          AND support_message_id = ${messageId}
          AND completed_at IS NOT NULL
      ) OR EXISTS (
        SELECT 1
        FROM support_inbound_email_receipts
        WHERE support_thread_id = ${threadId}
          AND support_message_id = ${messageId}
          AND customer_support_completed_at IS NOT NULL
      ) AS complete
    `,
    options,
  )
  return (rows[0] as { complete: boolean } | undefined)?.complete ?? false
}
