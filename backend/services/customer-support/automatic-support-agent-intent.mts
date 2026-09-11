import { read, write, type QueryOptions } from '@data-stores/psql'
import { decodeUuidCursor, encodeCursor, isSimpleCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { AgentModel, AgentModelProvider } from '@voucha/types/entities/agent-model'

export function getMemberSupportAgentJobId(messageId: string): string {
  return `support_member_thread__${messageId}__customer_support`
}

export type PendingMemberSupportAgentIntent = {
  threadId: string
  supportMessageId: string
  logicalJobId: string
}

export type PendingMemberSupportAgentIntentPage = {
  results: PendingMemberSupportAgentIntent[]
  page_info: PageInfo
}

type PendingMemberSupportAgentIntentRow = {
  support_thread_id: string
  support_message_id: string
  idempotency_key: string
}

export function createPendingMemberSupportAgentIntentPage(
  rows: PendingMemberSupportAgentIntentRow[],
  limit: number,
): PendingMemberSupportAgentIntentPage {
  const results = rows.slice(0, limit).map(row => ({
    threadId: row.support_thread_id,
    supportMessageId: row.support_message_id,
    logicalJobId: row.idempotency_key,
  }))
  return {
    results,
    page_info: {
      has_next_page: rows.length > limit,
      start_cursor: results[0] ? encodeCursor({ id: results[0].supportMessageId }) : null,
      end_cursor:
        rows.length > limit ? encodeCursor({ id: results.at(-1)!.supportMessageId }) : null,
    },
  }
}

export async function listPendingMemberSupportAgentIntents(
  options: { after?: string; limit?: number } = {},
): Promise<PendingMemberSupportAgentIntentPage> {
  const limit = options.limit ?? 100
  assert(
    Number.isInteger(limit) && limit > 0 && limit <= 100,
    422,
    'limit must be between 1 and 100',
  )
  const cursor = options.after
    ? decodeUuidCursor(options.after, isSimpleCursor, 'Invalid member support intent cursor')
    : null
  const query = buildListPendingMemberSupportAgentIntentsQuery(cursor?.id ?? null, limit)
  const { rows } = await read<PendingMemberSupportAgentIntentRow>(query)
  return createPendingMemberSupportAgentIntentPage(rows, limit)
}

export function buildListPendingMemberSupportAgentIntentsQuery(
  cursor: string | null,
  limit: number,
) {
  const query = sql`/* listPendingMemberSupportAgentIntents */
    SELECT support_thread_id, support_message_id, idempotency_key
    FROM support_agent_runs
    WHERE idempotency_key =
        'support_member_thread__' || support_message_id::TEXT || '__customer_support'
      AND completed_at IS NULL`
  if (cursor) query.append(sql`\n    AND support_message_id > ${cursor}`)
  query.append(sql`\n    ORDER BY support_message_id LIMIT ${limit + 1}`)
  return query
}

export async function reserveAutomaticSupportAgentIntent(
  params: {
    supportThreadId: string
    supportMessageId: string
    modelName: AgentModel
    modelProvider: AgentModelProvider
    input: { thread_subject: string; message_count: number }
  },
  options: QueryOptions,
): Promise<void> {
  const logicalJobId = getMemberSupportAgentJobId(params.supportMessageId)
  await write(
    sql`/* reserveAutomaticSupportAgentIntent */
      INSERT INTO support_agent_runs (
        support_thread_id, support_message_id, idempotency_key,
        model_name, model_provider, input
      ) VALUES (
        ${params.supportThreadId}, ${params.supportMessageId}, ${logicalJobId},
        ${params.modelName}, ${params.modelProvider},
        ${JSON.stringify({ ...params.input, source: 'member_thread' })}
      )
    `,
    options,
  )
}
