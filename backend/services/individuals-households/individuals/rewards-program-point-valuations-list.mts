import { getOrCreateIndividual } from './individuals.mts'
import {
  toPointValuation,
  type PointValuationRow,
} from './rewards-program-point-valuations-row.mts'
import type {
  GetIndividualRewardsProgramPointValuationsOptions,
  IndividualRewardsProgramPointValuationPage,
} from './rewards-program-point-valuations-types.mts'
import { read } from '@data-stores/psql'
import {
  buildPageInfo,
  decodeScopedUuidCursor,
  parseBoundedIntegerLimit,
} from '@modules/pagination'
import { currentUserCanAccessUser } from '@services/users/authorization'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'

function pointValuationCursorScope(individualId: string): string {
  return `my-point-valuations:${individualId}:id-asc`
}

export const getIndividualRewardsProgramPointValuations = async (
  currentUser: PrivateUser | null,
  user: PrivateUser,
  options: GetIndividualRewardsProgramPointValuationsOptions = {},
): Promise<IndividualRewardsProgramPointValuationPage> => {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanAccessUser(currentUser, user.id), 403, 'Forbidden')
  const individual = await getOrCreateIndividual(user)
  const limit = parseBoundedIntegerLimit(options.limit, { default: 25, min: 1, max: 100 })
  const scope = pointValuationCursorScope(individual.id)
  const cursorId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid point valuation cursor').id
    : null
  const query = sql`/* getIndividualRewardsProgramPointValuations */
    SELECT
      individual_rewards_program_point_valuations.id,
      individual_rewards_program_point_valuations.rewards_program_id,
      individual_rewards_program_point_valuations.value_microunits_per_point::TEXT AS value_microunits_per_point,
      individual_rewards_program_point_valuations.currency_code,
      individual_rewards_program_point_valuations.note,
      rewards_program.name AS rewards_program_name,
      rewards_program.slug AS rewards_program_slug
    FROM individual_rewards_program_point_valuations
    JOIN LATERAL (
      SELECT view_topics.name, view_topics.slug
      FROM view_topics
      WHERE view_topics.id = individual_rewards_program_point_valuations.rewards_program_id
      LIMIT 1
    ) rewards_program ON TRUE
    WHERE individual_id = ${individual.id}`
  if (cursorId) {
    query.append(sql` AND individual_rewards_program_point_valuations.id > ${cursorId}`)
  }
  query.append(sql`
    ORDER BY individual_rewards_program_point_valuations.id ASC
    LIMIT ${limit + 1}`)
  const { rows } = await read<PointValuationRow>(query)
  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit).map(toPointValuation)
  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage,
      getCursor: valuation => ({ id: valuation.id, scope }),
    }),
  }
}
