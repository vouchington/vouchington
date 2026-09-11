import { read, write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueCustomerSupport } from '@queues/ai-agents/enqueues/customer-support'
import { decodeUuidCursor, isSimpleCursor, buildPageInfo } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { SupportThread, SupportThreadWithStatus } from './types.mts'
export {
  assignSupportThread,
  reopenSupportThread,
  resolveSupportThread,
} from './thread-lifecycle.mts'
export { searchSupportThreads } from './search-support-threads.mts'

const THREAD_STATUS_SQL = sql`
  CASE
    WHEN resolved_at IS NOT NULL THEN 'resolved'
    WHEN assigned_at IS NOT NULL THEN 'assigned'
    ELSE 'open'
  END AS status
`

export async function createSupportThread(
  supportContactId: string,
  subject: string,
  options: { conversationId?: string; skipEnqueue?: boolean } & QueryOptions = {},
): Promise<SupportThread> {
  const { rows } = await write(
    sql`/* createSupportThread */
    INSERT INTO support_threads (support_contact_id, subject, conversation_id)
    VALUES (${supportContactId}, ${subject}, ${options?.conversationId ?? null})
    RETURNING
      id,
      support_contact_id,
      subject,
      conversation_id,
      created_at,
      updated_at,
      assigned_at,
      assigned_to_id,
      resolved_at,
      resolved_by_id,
      'open' AS status
  `,
    options,
  )
  const thread = rows[0] as SupportThread
  if (!options.skipEnqueue) void enqueueCustomerSupport(thread.id)
  return thread
}

export async function getSupportThreadById(
  id: string,
  options: QueryOptions = {},
): Promise<SupportThreadWithStatus | null> {
  const query = sql`/* getSupportThreadById */
    SELECT
      t.id,
      t.support_contact_id,
      t.subject,
      t.conversation_id,
      t.created_at,
      t.updated_at,
      t.assigned_at,
      t.assigned_to_id,
      t.resolved_at,
      t.resolved_by_id,
      c.user_id AS contact_user_id,
  `
  query.append(THREAD_STATUS_SQL)
  query.append(sql`
    FROM support_threads t
    JOIN support_contacts c ON c.id = t.support_contact_id
    WHERE t.id = ${id}
    LIMIT 1
  `)
  const { rows } = await (options.readOnly === false
    ? write(query, options)
    : read(query, { ...options, readOnly: true }))
  return (rows[0] as SupportThreadWithStatus) ?? null
}

export async function getSupportThreadsByContactId(
  contactId: string,
  options?: { limit?: number; after?: string },
): Promise<{ results: SupportThreadWithStatus[]; page_info: PageInfo }> {
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100)

  let afterId: string | null = null
  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isSimpleCursor, 'Invalid cursor format')
    afterId = cursor.id
  }

  const query = sql`/* getSupportThreadsByContactId */
    SELECT
      id,
      support_contact_id,
      subject,
      conversation_id,
      created_at,
      updated_at,
      assigned_at,
      assigned_to_id,
      resolved_at,
      resolved_by_id,
  `
  query.append(THREAD_STATUS_SQL)
  query.append(sql`
    FROM support_threads
    WHERE support_contact_id = ${contactId}
  `)

  if (afterId) {
    query.append(sql` AND id < ${afterId}`)
  }

  query.append(sql` ORDER BY id DESC LIMIT ${limit + 1}`)

  const { rows } = await read(query)
  const threads = rows as SupportThreadWithStatus[]

  const hasNextPage = threads.length > limit
  const results = hasNextPage ? threads.slice(0, limit) : threads

  const page_info = buildPageInfo(results, {
    hasNextPage,
    getCursor: item => ({ id: item.id }),
  })

  return { results, page_info }
}
