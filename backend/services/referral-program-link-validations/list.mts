import { read, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { validateUUID } from '@modules/utils'
import { escapeLikePattern } from '@services/topics/search/query-builder-utils'
import type { PageInfo } from '@voucha/types/pagination'
import { decodeUuidCursor, encodeCursor, isNameCursor, isSimpleCursor } from '@modules/pagination'
import { clampLimit } from '@services/pagination'
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
    FROM referral_program_link_validation_rule_sets
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

  const { rows } = await read<ReferralLinkValidation>(query, queryOptions)

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

export const PROGRAM_VALIDATION_HYDRATION_LIMIT = 1

export async function listReferralLinkValidationsForProgram(
  referralProgramId: string,
  options?: QueryOptions & {
    limit?: number
    after?: string
  },
): Promise<{
  results: ReferralLinkValidation[]
  page_info: PageInfo
}> {
  validateUUID(referralProgramId)
  const limit = clampLimit(options?.limit, 50)
  const cursorId = options?.after
    ? decodeUuidCursor(options.after, isSimpleCursor, 'Invalid cursor format: expected UUID cursor')
        .id
    : undefined
  const { limit: _limit, after: _after, ...queryOptions } = options ?? {}

  // The junction primary key supplies the scoped descending walk before hydration.
  const query = sql`/* listReferralLinkValidationsForProgram */
    WITH page AS MATERIALIZED (
      SELECT referral_program_link_validation_rule_set_id AS id
      FROM referral_program_topic_link_validation_rule_sets
      WHERE referral_program_topic_id = ${referralProgramId}`
  if (cursorId !== undefined) {
    query.append(sql` AND referral_program_link_validation_rule_set_id < ${cursorId}::uuid`)
  }
  query.append(sql`
      ORDER BY referral_program_link_validation_rule_set_id DESC
      LIMIT ${limit + 1}
    )
    SELECT validation.id, validation.slug, validation.user_help_text, validation.updated_at
    FROM page
    CROSS JOIN LATERAL (
      SELECT v.id, v.slug, v.user_help_text, v.updated_at
      FROM referral_program_link_validation_rule_sets v
      WHERE v.id = page.id
      LIMIT ${PROGRAM_VALIDATION_HYDRATION_LIMIT}
    ) validation
    ORDER BY page.id DESC
  `)

  const { rows } = await read<ReferralLinkValidation>(query, queryOptions)
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
