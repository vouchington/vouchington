import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { decodeUuidCursor, encodeCursor, isNameCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { CommunityInvite } from '../types.mts'

export async function searchInvites(
  communityId: string,
  options?: QueryOptions & {
    limit?: number
    after?: string
  },
): Promise<{ results: CommunityInvite[]; page_info: PageInfo }> {
  const limit = options?.limit ?? 20
  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')

  let cursorId: string | undefined

  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isNameCursor, 'Invalid cursor format')
    cursorId = cursor.id
  }

  const query = sql`/* searchInvites */
    SELECT *
    FROM community_invites
    WHERE community_id = ${communityId}
  `

  if (cursorId !== undefined) {
    query.append(sql` AND id < ${cursorId}`)
  }

  query.append(sql`
    ORDER BY id DESC
    LIMIT ${limit + 1}
  `)

  const { rows } = await read(query, options)

  const hasNextPage = rows.length > limit
  const results: CommunityInvite[] = []
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    results.push(rows[i]! as CommunityInvite)
  }

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && results.length > 0
          ? encodeCursor({
              name: results[results.length - 1]!.id,
              id: results[results.length - 1]!.id,
            })
          : null,
      start_cursor:
        results.length > 0 ? encodeCursor({ name: results[0]!.id, id: results[0]!.id }) : null,
    },
  }
}

export async function getMyInvites(
  currentUserId: string,
  options?: QueryOptions,
): Promise<CommunityInvite[]> {
  const { rows } = await read(
    sql`/* getMyInvites */
    SELECT *
    FROM community_invites
    WHERE invited_user_id = ${currentUserId}
      AND accepted_at IS NULL
      AND declined_at IS NULL
      AND revoked_at IS NULL
    ORDER BY id DESC
    `,
    options,
  )
  return rows as CommunityInvite[]
}
