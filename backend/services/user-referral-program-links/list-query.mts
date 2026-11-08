import { createPaginationParser } from '@modules/pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import { defineQueryContract, queryUuid } from '@vouchington/pagination'

/**
 * The `GET /api/v1/referral-links` list query, shared with `get_referral_links`.
 * The static limit is 1 through 100 and defaults to 100. Callers apply the runtime bounds.
 */
export const userReferralLinksParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 100 },
})

export const userReferralLinksQueryContract = defineQueryContract({
  user_id: queryUuid(),
  referral_program_id: queryUuid(),
})

/** Query object the generated request contract validates, with the parser's clamped limit. */
export function prepareUserReferralLinksListQuery(
  query: Record<string, unknown>,
  parsedLimit: number,
): Record<string, unknown> {
  const validationQuery = prepareQueryForValidation(query, {
    ...userReferralLinksParser.queryContract,
    ...userReferralLinksQueryContract.queryContract,
  })
  if (query.limit !== undefined) validationQuery.limit = parsedLimit
  return validationQuery
}
