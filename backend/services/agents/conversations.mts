import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import assert from 'http-assert'
import { getPublicUserByAny } from '@services/users/get'
import { getPostByAny } from '@services/posts/get'
import type { Conversation } from '@voucha/types/entities/conversation'
import { isUUID } from '@modules/utils'
import { agentConversationListCursorScope } from '@modules/agents'

type SearchAgentConversationsOptions = {
  limit?: number
  after?: string
  user_id?: string
  username?: string
  post_id?: string
  post_slug?: string
  rss_feed_item_id?: string
  onlyLinkedToSupportThread?: boolean
}

export async function searchAgentConversations(
  systemUserId: string,
  options?: SearchAgentConversationsOptions,
) {
  const limit = options?.limit ?? 25
  const [resolvedUserId, resolvedPostId] = await Promise.all([
    options?.user_id === undefined ? resolveUserId(options?.username) : undefined,
    options?.post_id === undefined ? resolvePostId(options?.post_slug) : undefined,
  ])
  const userId = options?.user_id ?? resolvedUserId
  const postId = options?.post_id ?? resolvedPostId
  const rssFeedItemId = options?.rss_feed_item_id
  if (rssFeedItemId) {
    assert(isUUID(rssFeedItemId), 422, 'rss_feed_item_id must be a valid UUID')
  }
  const unresolvedTextFilters = [
    ...(options?.user_id === undefined && options?.username && !resolvedUserId
      ? [{ kind: 'username' as const, value: normalizeTextSelector(options.username) }]
      : []),
    ...(options?.post_id === undefined && options?.post_slug && !resolvedPostId
      ? [{ kind: 'post_slug' as const, value: normalizeTextSelector(options.post_slug) }]
      : []),
  ]
  const cursorScope = agentConversationListCursorScope({
    agentSystemUserId: systemUserId,
    userId,
    postId,
    rssFeedItemId,
    onlyLinked: options?.onlyLinkedToSupportThread ?? false,
    unresolvedTextFilters,
  })

  let cursorId: string | undefined
  if (options?.after) {
    const cursor = decodeScopedUuidCursor(options.after, cursorScope, 'Invalid cursor format')
    cursorId = cursor.id
  }

  if (unresolvedTextFilters.length > 0) {
    return emptyConversationPage()
  }

  const query = sql`/* searchAgentConversations */
    SELECT DISTINCT
      c.id,
      c.title,
      c.created_at,
      c.created_by_id,
      c.updated_at,
      c.updated_by_id,
      c.deleted_at,
      c.deleted_by_id
    FROM conversations c
    JOIN conversation_messages cm
      ON cm.conversation_id = c.id
      AND cm.created_by_id = ${systemUserId}
      AND cm.deleted_at IS NULL
    WHERE c.deleted_at IS NULL
  `

  if (options?.onlyLinkedToSupportThread) {
    query.append(
      sql` AND EXISTS (
        SELECT 1 FROM support_threads st
        JOIN support_contacts sc ON sc.id = st.support_contact_id
        WHERE st.conversation_id = c.id
          AND sc.user_id = c.created_by_id
      )`,
    )
  }

  if (cursorId) {
    query.append(sql` AND c.id < ${cursorId}`)
  }
  if (userId) {
    query.append(sql` AND c.created_by_id = ${userId}`)
  }
  if (postId) {
    query.append(sql` AND c.post_id = ${postId}`)
  }
  if (rssFeedItemId) {
    query.append(sql` AND c.rss_feed_item_id = ${rssFeedItemId}`)
  }

  query.append(sql` ORDER BY c.id DESC LIMIT ${limit + 1}`)

  const { rows } = await read(query)

  const hasNextPage = rows.length > limit
  if (hasNextPage) rows.pop()
  const results: Conversation[] = rows

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && results.length > 0
          ? encodeScopedUuidCursor(results.at(-1)!.id, cursorScope)
          : null,
      start_cursor: results.length > 0 ? encodeScopedUuidCursor(results[0].id, cursorScope) : null,
    },
  }
}

function emptyConversationPage() {
  return {
    results: [] as Conversation[],
    page_info: {
      has_next_page: false,
      end_cursor: null,
      start_cursor: null,
    },
  }
}

async function resolveUserId(username?: string): Promise<string | undefined> {
  if (!username) return undefined
  return (await getPublicUserByAny(normalizeTextSelector(username)))?.id
}

async function resolvePostId(slug?: string): Promise<string | undefined> {
  if (!slug) return undefined
  return (await getPostByAny(normalizeTextSelector(slug)))?.id
}

function normalizeTextSelector(value: string): string {
  return value.trim().toLowerCase()
}
