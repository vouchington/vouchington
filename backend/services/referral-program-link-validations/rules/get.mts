import { read, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { validateUUID } from '@modules/utils'
import type { ReferralLinkValidationRule } from './types.mts'
import type { PageInfo } from '@voucha/types/pagination'
import { decodeUuidCursor, encodeCursor, isSimpleCursor } from '@modules/pagination'

export async function getReferralLinkValidationRule(
  ruleId: string,
  options?: QueryOptions,
): Promise<ReferralLinkValidationRule | null> {
  validateUUID(ruleId)

  const { rows } = await read(
    sql`/* getReferralLinkValidationRule */
      SELECT
        id,
        referral_program_link_validation_id,
        hostname,
        pathname,
        is_referral_link_url,
        is_invalid_referral_link_url,
        user_error_text,
        example_urls,
        created_at,
        updated_at
      FROM referral_program_link_validations_rules
      WHERE id = ${ruleId}
      LIMIT 1
    `,
    options,
  )

  return rows[0] ?? null
}

export async function getReferralLinkValidationRules(
  validationId: string,
  options?: QueryOptions & {
    limit?: number
    after?: string
  },
): Promise<{
  results: ReferralLinkValidationRule[]
  page_info: PageInfo
}> {
  validateUUID(validationId)

  const limit = options?.limit ?? 50
  const after = options?.after

  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')

  // Decode cursor
  let cursorId: string | undefined
  if (after) {
    const cursor = decodeUuidCursor(
      after,
      isSimpleCursor,
      'Invalid cursor format: expected simple cursor',
    )
    cursorId = cursor.id
  }

  const { limit: _limit, after: _after, ...queryOptions } = options ?? {}

  const query = sql`/* getReferralLinkValidationRules */
    SELECT
      id,
      referral_program_link_validation_id,
      hostname,
      pathname,
      is_referral_link_url,
      is_invalid_referral_link_url,
      user_error_text,
      example_urls,
      created_at,
      updated_at
    FROM referral_program_link_validations_rules
    WHERE referral_program_link_validation_id = ${validationId}
  `

  // Cursor-based pagination
  if (cursorId) {
    query.append(sql` AND id > ${cursorId}`)
  }

  query.append(sql`
    ORDER BY id ASC
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
        hasNextPage && results.length > 0 ? encodeCursor({ id: results.at(-1)!.id }) : null,
      start_cursor: results.length > 0 ? encodeCursor({ id: results[0].id }) : null,
    },
  }
}
