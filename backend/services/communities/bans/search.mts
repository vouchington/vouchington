import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import {
  decodeScopedUuidCursor,
  decodeUuidCursor,
  encodeCursor,
  encodeScopedUuidCursor,
  isSimpleCursor,
} from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { CommunityBan } from '../types.mts'

export type UserCommunityBanItem = CommunityBan & { community_slug: string | null }

export async function listUserActiveCommunityBans(
  userId: string,
  options?: QueryOptions & { limit?: number; after?: string },
): Promise<{ results: UserCommunityBanItem[]; page_info: PageInfo }> {
  const limit = options?.limit ?? 25
  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')

  let cursorId: string | undefined
  const cursorScope = `user-community-bans:${userId}:active:id-desc`
  if (options?.after) {
    const cursor = decodeScopedUuidCursor(options.after, cursorScope, 'Invalid cursor format')
    cursorId = cursor.id
  }

  const query = sql`/* listUserActiveCommunityBans */
    SELECT cb.*, c.slug AS community_slug
    FROM community_bans cb
    LEFT JOIN communities c ON c.id = cb.community_id
    WHERE cb.user_id = ${userId}
      AND cb.lifted_at IS NULL
      AND (cb.expires_at IS NULL OR cb.expires_at > CURRENT_TIMESTAMP)
  `

  if (cursorId !== undefined) {
    // DESC order: next page has smaller IDs than the cursor
    query.append(sql` AND cb.id < ${cursorId}`)
  }

  query.append(sql`
    ORDER BY cb.id DESC
    LIMIT ${limit + 1}
  `)

  const { rows } = await read(query, options)

  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit) as UserCommunityBanItem[]

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && results.length > 0
          ? encodeScopedUuidCursor(results[results.length - 1]!.id, cursorScope)
          : null,
      start_cursor: results.length > 0 ? encodeScopedUuidCursor(results[0]!.id, cursorScope) : null,
    },
  }
}

export async function searchCommunityBans(
  communityId: string,
  options?: QueryOptions & { limit?: number; after?: string },
): Promise<{ results: CommunityBan[]; page_info: PageInfo }> {
  const limit = options?.limit ?? 20
  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')

  let cursorId: string | undefined

  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isSimpleCursor, 'Invalid cursor format')
    cursorId = cursor.id
  }

  const query = sql`/* searchCommunityBans */
    SELECT *
    FROM community_bans
    WHERE community_id = ${communityId}
  `

  if (cursorId !== undefined) {
    query.append(sql` AND id > ${cursorId}`)
  }

  query.append(sql`
    ORDER BY id ASC
    LIMIT ${limit + 1}
  `)

  const { rows } = await read(query, options)

  const hasNextPage = rows.length > limit
  const results: CommunityBan[] = []
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    results.push(rows[i]! as CommunityBan)
  }

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && results.length > 0
          ? encodeCursor({ id: results[results.length - 1]!.id })
          : null,
      start_cursor: results.length > 0 ? encodeCursor({ id: results[0]!.id }) : null,
    },
  }
}
