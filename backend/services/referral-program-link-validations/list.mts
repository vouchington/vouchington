import { read, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { validateUUID } from '@modules/utils'
import { escapeLikePattern } from '@services/topics/search/query-builder-utils'
import type { PageInfo } from '@voucha/types/pagination'
import { decodeUuidCursor, encodeCursor, isNameCursor } from '@modules/pagination'
import type { ReferralLinkValidation } from './validations.mts'

export async function listReferralLinkValidations(
  options?: QueryOptions & {
    limit?: number
    after?: string
    search?: string
  },
): Promise<{
  results: ReferralLinkValidation[]
  page_info: PageInfo
}> {
  const limit = options?.limit ?? 50
  const after = options?.after
  const search = options?.search

  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')

  // Decode cursor
  let cursorSlug: string | undefined
  let cursorId: string | undefined

  if (after) {
    const cursor = decodeUuidCursor(
      after,
      isNameCursor,
      'Invalid cursor format: expected name cursor',
    )
    cursorSlug = cursor.name
    cursorId = cursor.id
  }

  const { limit: _limit, after: _after, search: _search, ...queryOptions } = options ?? {}

  const query = sql`/* listReferralLinkValidations */
    SELECT id, slug, user_help_text, updated_at
    FROM referral_program_link_validations
  `

  // Search and cursor-based pagination filters
  if (search && cursorSlug !== undefined && cursorId !== undefined) {
    query.append(
      sql`/* listReferralLinkValidations */ WHERE slug LIKE ${`${escapeLikePattern(search.toLowerCase())}%`} ESCAPE '\\' AND (slug, id) > (${cursorSlug}, ${cursorId})`,
    )
  } else if (search) {
    query.append(
      sql`/* listReferralLinkValidations */ WHERE slug LIKE ${`${escapeLikePattern(search.toLowerCase())}%`} ESCAPE '\\'`,
    )
  } else if (cursorSlug !== undefined && cursorId !== undefined) {
    query.append(sql` WHERE (slug, id) > (${cursorSlug}, ${cursorId})`)
  }

  query.append(sql`
    ORDER BY slug ASC, id ASC
    LIMIT ${limit + 1}
  `)

  const { rows } = await read(query, queryOptions)

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
        hasNextPage && results.length > 0
          ? encodeCursor({ name: results.at(-1)!.slug, id: results.at(-1)!.id })
          : null,
      start_cursor:
        results.length > 0 ? encodeCursor({ name: results[0].slug, id: results[0].id }) : null,
    },
  }
}

export async function listReferralLinkValidationsForProgram(
  referralProgramId: string,
  options?: QueryOptions,
): Promise<ReferralLinkValidation[]> {
  validateUUID(referralProgramId)
  const { rows } = await read(
    sql`/* listReferralLinkValidationsForProgram */
      SELECT v.id, v.slug, v.user_help_text, v.updated_at
      FROM referral_program_link_validations v
      JOIN topics__referral_program_link_validations j
        ON j.referral_program_link_validation_id = v.id
      WHERE j.referral_program_id = ${referralProgramId}
      ORDER BY v.slug ASC, v.id ASC
    `,
    options,
  )
  return rows
}
