import { read, write } from '@data-stores/psql'
import { decodeUuidCursor, encodeCursor, isSimpleCursor } from '@modules/pagination'
import type { KeyedCustomerSupportJobInput } from '@queues/ai-agents/enqueues/customer-support'
import type { PageInfo } from '@voucha/types/pagination'
import assert from 'http-assert'
import sql from 'sql-template-strings'

const DEFAULT_RECOVERY_BATCH_SIZE = 100
const MAX_RECOVERY_BATCH_SIZE = 100

export type InboundCustomerSupportRecoveryPage = {
  results: KeyedCustomerSupportJobInput[]
  page_info: PageInfo
}

export async function repairInboundCustomerSupportCompletionReceipts(): Promise<number> {
  const result = await write(sql`/* repairInboundCustomerSupportCompletionReceipts */
    UPDATE support_inbound_email_receipts receipt
    SET customer_support_enqueued_at = COALESCE(
          receipt.customer_support_enqueued_at,
          completed_run.completed_at
        ),
        customer_support_completed_at = completed_run.completed_at
    FROM support_agent_runs completed_run
    WHERE receipt.customer_support_completed_at IS NULL
      AND receipt.support_thread_id IS NOT NULL
      AND receipt.support_message_id IS NOT NULL
      AND completed_run.idempotency_key =
        'support_inbound_email__' || receipt.support_message_id::text || '__customer_support'
      AND completed_run.support_thread_id = receipt.support_thread_id
      AND completed_run.support_message_id = receipt.support_message_id
      AND completed_run.completed_at IS NOT NULL
  `)
  return result.rowCount ?? 0
}

export async function listInboundCustomerSupportRecoveryCandidates(
  options: { after?: string; limit?: number } = {},
): Promise<InboundCustomerSupportRecoveryPage> {
  const limit = options.limit ?? DEFAULT_RECOVERY_BATCH_SIZE
  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= MAX_RECOVERY_BATCH_SIZE, 422, 'limit must be between 1 and 100')
  const cursor = options.after
    ? decodeUuidCursor(options.after, isSimpleCursor, 'Invalid recovery cursor')
    : null
  if (!cursor) await repairInboundCustomerSupportCompletionReceipts()

  const query = sql`/* listInboundCustomerSupportRecoveryCandidates */
    SELECT DISTINCT
      receipt.support_thread_id,
      receipt.support_message_id
    FROM support_inbound_email_receipts receipt
    WHERE receipt.processed_at IS NOT NULL
      AND receipt.support_thread_id IS NOT NULL
      AND receipt.support_message_id IS NOT NULL
      AND receipt.customer_support_completed_at IS NULL
  `
  if (cursor) {
    query.append(sql`
      AND receipt.support_message_id > ${cursor.id}
    `)
  }
  query.append(sql`
      AND NOT EXISTS (
        SELECT 1
        FROM support_agent_runs completed_run
        WHERE completed_run.idempotency_key =
          'support_inbound_email__' || receipt.support_message_id::text || '__customer_support'
          AND completed_run.support_thread_id = receipt.support_thread_id
          AND completed_run.support_message_id = receipt.support_message_id
          AND completed_run.completed_at IS NOT NULL
      )
    ORDER BY receipt.support_message_id
    LIMIT ${limit + 1}
  `)
  const { rows } = await read<{
    support_thread_id: string
    support_message_id: string
  }>(query)
  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit).map(row => ({
    threadId: row.support_thread_id,
    supportMessageId: row.support_message_id,
    logicalJobId: `support_inbound_email__${row.support_message_id}__customer_support`,
  }))
  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: results[0] ? encodeCursor({ id: results[0].supportMessageId }) : null,
      end_cursor:
        hasNextPage && results.length > 0
          ? encodeCursor({ id: results.at(-1)!.supportMessageId })
          : null,
    },
  }
}
