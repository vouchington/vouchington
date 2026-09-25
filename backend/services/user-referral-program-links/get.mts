import { read, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { validateUUID } from '@modules/utils'
import { decodeUuidCursor, encodeCursor, isSimpleCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import { currentUserCanAccessUserReferralLinks } from './authorization.mts'
import type { UserReferralLink, UserReferralLinkWithDetails } from './types.mts'
import { userReferralLinkColumns } from './columns.mts'

export async function getUserReferralLinks(
  currentUser: PrivateUser | null,
  userId: string,
  options?: QueryOptions & {
    limit?: number
    after?: string
    referral_program_id?: string
  },
): Promise<{
  results: UserReferralLinkWithDetails[]
  page_info: PageInfo
}> {
  assert(currentUser, 401, 'User not logged in')
  validateUUID(userId)

  assert(currentUserCanAccessUserReferralLinks(currentUser, userId), 403, 'Forbidden')

  const limit = options?.limit ?? 50
  const after = options?.after
  const referralProgramId = options?.referral_program_id

  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')

  // Decode cursor if provided
  let cursorId: string | undefined
  if (after) {
    const cursor = decodeUuidCursor(
      after,
      isSimpleCursor,
      'Invalid cursor format: expected simple cursor',
    )
    cursorId = cursor.id
  }

  if (referralProgramId !== undefined) {
    validateUUID(referralProgramId)
  }

  const {
    limit: _limit,
    after: _after,
    referral_program_id: _refProgId,
    ...queryOptions
  } = options ?? {}

  const query = sql`/* getUserReferralLinks */
    SELECT `
    .append(userReferralLinkColumns('urpl'))
    .append(
      sql`,
      u.url,
      t.name AS referral_program_name,
      t.slug AS referral_program_slug
    FROM user_referral_program_links urpl
    JOIN urls u ON u.id = urpl.url_id
    JOIN topics t ON t.id = urpl.referral_program_id
      AND t.deleted_at IS NULL
      AND t.merged_into_topic_id IS NULL
    WHERE urpl.user_id = ${userId}
      AND urpl.deleted_at IS NULL
      AND urpl.parent_link_id IS NULL
  `,
    )

  if (referralProgramId) {
    query.append(sql` AND urpl.referral_program_id = ${referralProgramId}`)
  }

  // Cursor-based pagination
  if (cursorId) {
    query.append(sql` AND urpl.id < ${cursorId}`)
  }

  query.append(sql`
    ORDER BY urpl.id DESC
    LIMIT ${limit + 1}
  `)

  const { rows } = await read(query, queryOptions)

  // Check if there are more results
  const hasNextPage = rows.length > limit
  const results: typeof rows = []
  const itemCount = Math.min(rows.length, limit)
  for (let i = 0; i < itemCount; i++) {
    results.push(rows[i]!)
  }

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && results.length > 0 ? encodeCursor({ id: results.at(-1)!.id }) : null,
      start_cursor: results.length > 0 ? encodeCursor({ id: results[0].id }) : null,
    },
  }
}

export async function getUserReferralLink(
  linkId: string,
  options?: QueryOptions,
): Promise<UserReferralLink | null> {
  validateUUID(linkId)

  const { rows } = await read(
    sql`/* getUserReferralLink */
      SELECT `
      .append(userReferralLinkColumns())
      .append(
        sql`
      FROM user_referral_program_links
      WHERE id = ${linkId}
        AND deleted_at IS NULL
      LIMIT 1
    `,
      ),
    options,
  )

  return rows[0] ?? null
}

export async function isReferralLinkUrlId(urlId: string): Promise<boolean> {
  const { rows } = await read(sql`/* isReferralLinkUrlId */
    SELECT 1 FROM user_referral_program_links
    WHERE url_id = ${urlId}
      AND deleted_at IS NULL
    LIMIT 1
  `)
  return rows.length > 0
}
