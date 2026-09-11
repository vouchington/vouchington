import { read, write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decodeUuidCursor, isSimpleCursor, encodeCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { SupportMessage } from './types.mts'

type GetSupportMessagesByThreadIdOptions = QueryOptions & {
  limit?: number
  page?: 'latest'
} & (
    | { after?: string; atOrBeforeMessageId?: never }
    | { after?: never; atOrBeforeMessageId: string }
  )

export async function getSupportMessagesByThreadId(
  threadId: string,
  options?: GetSupportMessagesByThreadIdOptions,
): Promise<{ results: SupportMessage[]; page_info: PageInfo }> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100)

  let afterId: string | null = null
  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isSimpleCursor, 'Invalid cursor format')
    afterId = cursor.id
  }

  const query = sql`/* getSupportMessagesByThreadId */
    SELECT
      id,
      support_thread_id,
      direction,
      body_text,
      body_html,
      created_at,
      created_by_id,
      updated_at,
      email_message_id,
      email_subject,
      email_from,
      email_to,
      drafted_at,
      edited_at,
      edited_by_id,
      approved_at,
      approved_by_id,
      sent_at
    FROM support_messages
    WHERE support_thread_id = ${threadId}
  `

  if (options?.atOrBeforeMessageId) {
    query.append(sql`
      AND (support_thread_id, id) <= (
        ${threadId},
        (
          SELECT id
          FROM support_messages
          WHERE support_thread_id = ${threadId}
            AND id = ${options.atOrBeforeMessageId}
        )
      )
    `)
  } else if (afterId) {
    query.append(sql`
      AND (support_thread_id, id) < (
        ${threadId},
        (
          SELECT id
          FROM support_messages
          WHERE support_thread_id = ${threadId}
            AND id = ${afterId}
        )
      )
    `)
  }

  query.append(sql` ORDER BY support_thread_id DESC, id DESC`)
  query.append(sql` LIMIT ${limit + 1}`)

  const { rows } = await (options?.readOnly === false
    ? write(query, options)
    : read(query, { ...options, readOnly: true }))
  const messages = (rows as SupportMessage[]).slice(0, limit).toReversed()
  const page_info = buildOlderMessagesPageInfo(messages, rows.length > limit)

  return { results: messages, page_info }
}

function buildOlderMessagesPageInfo(
  messages: readonly SupportMessage[],
  hasOlderMessages: boolean,
): PageInfo {
  const oldestMessage = messages[0]
  const oldestCursor = oldestMessage ? encodeCursor({ id: oldestMessage.id }) : null

  return {
    has_next_page: hasOlderMessages,
    start_cursor: oldestCursor,
    end_cursor: hasOlderMessages ? oldestCursor : null,
  }
}
