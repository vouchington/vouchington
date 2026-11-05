import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { decodeUuidCursor, encodeCursor, isNameCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { CommunityApplication, CommunityApplicationSummary } from '../types.mts'
import { communityApplicationColumns, communityApplicationSummaryColumns } from './columns.mts'

type ApplicationStatus = 'pending' | 'approved' | 'rejected'

export async function getApplication(
  id: string,
  options?: QueryOptions,
): Promise<CommunityApplication | null> {
  const { rows } = await read(
    sql`/* getApplication */
    SELECT `
      .append(communityApplicationColumns)
      .append(
        sql`
    FROM community_applications
    WHERE id = ${id}
    LIMIT 1
    `,
      ),
    options,
  )
  return (rows[0] as CommunityApplication) ?? null
}

/** One application of this community, with its answers; 404 when it belongs to another. */
export async function getCommunityApplication(
  communityId: string,
  applicationId: string,
): Promise<CommunityApplication> {
  const application = await getApplication(applicationId)
  assert(application?.community_id === communityId, 404, 'Application not found')
  return application
}

export async function searchApplications(
  communityId: string,
  options?: QueryOptions & {
    status?: ApplicationStatus
    limit?: number
    after?: string
  },
): Promise<{ results: CommunityApplicationSummary[]; page_info: PageInfo }> {
  const limit = options?.limit ?? 20
  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')

  let cursorId: string | undefined

  if (options?.after) {
    const cursor = decodeUuidCursor(options.after, isNameCursor, 'Invalid cursor format')
    cursorId = cursor.id
  }

  const query = sql`/* searchApplications */
    SELECT `
    .append(communityApplicationSummaryColumns)
    .append(
      sql`
    FROM community_applications
    WHERE community_id = ${communityId}
  `,
    )

  if (options?.status === 'pending') {
    query.append(sql` AND approved_at IS NULL AND rejected_at IS NULL`)
  } else if (options?.status === 'approved') {
    query.append(sql` AND approved_at IS NOT NULL`)
  } else if (options?.status === 'rejected') {
    query.append(sql` AND rejected_at IS NOT NULL`)
  }

  if (cursorId !== undefined) {
    query.append(sql` AND id > ${cursorId}`)
  }

  query.append(sql`
    ORDER BY id ASC
    LIMIT ${limit + 1}
  `)

  const { rows } = await read(query, options)

  const hasNextPage = rows.length > limit
  const results: CommunityApplicationSummary[] = []
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    results.push(rows[i]! as CommunityApplicationSummary)
  }

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && results.length > 0
          ? encodeCursor({
              name: results.at(-1)!.id,
              id: results.at(-1)!.id,
            })
          : null,
      start_cursor:
        results.length > 0 ? encodeCursor({ name: results[0]!.id, id: results[0]!.id }) : null,
    },
  }
}
