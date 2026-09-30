import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { PageInfo } from '@voucha/types/pagination'
import sql from 'sql-template-strings'
import type { CommunityInvite } from '../types.mts'
import { buildCommunityIdCursorPage, resolveCommunityIdCursorPage } from '../id-cursor-page.mts'

export async function searchInvites(
  communityId: string,
  options?: QueryOptions & {
    limit?: number
    after?: string
  },
): Promise<{ results: CommunityInvite[]; page_info: PageInfo }> {
  const { limit, cursorId } = resolveCommunityIdCursorPage(options)

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
  return buildCommunityIdCursorPage(rows as CommunityInvite[], limit)
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
