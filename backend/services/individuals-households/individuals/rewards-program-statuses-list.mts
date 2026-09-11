import { getOrCreateIndividual } from './individuals.mts'
import {
  toRewardsProgramStatus,
  type RewardsProgramStatusRow,
} from './rewards-program-statuses-row.mts'
import type {
  GetIndividualRewardsProgramStatusesOptions,
  IndividualRewardsProgramStatusPage,
} from './rewards-program-statuses-types.mts'
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

function rewardsProgramStatusesCursorScope(individualId: string): string {
  return `my-rewards-program-statuses:${individualId}:id-asc`
}

export async function getIndividualRewardsProgramStatuses(
  currentUser: PrivateUser | null,
  user: PrivateUser,
  options: GetIndividualRewardsProgramStatusesOptions = {},
): Promise<IndividualRewardsProgramStatusPage> {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanAccessUser(currentUser, user.id), 403, 'Forbidden')
  const individual = await getOrCreateIndividual(user)
  const limit = parseBoundedIntegerLimit(options.limit, { default: 25, min: 1, max: 100 })
  const scope = rewardsProgramStatusesCursorScope(individual.id)
  const cursorId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid rewards program status cursor').id
    : null
  const query = sql`/* getIndividualRewardsProgramStatuses */
    SELECT individual_rewards_program_statuses.id,
      individual_rewards_program_statuses.since::TEXT AS since,
      individual_rewards_program_statuses.until::TEXT AS until,
      individual_rewards_program_statuses.rewards_program_status_id,
      rewards_program_status.name AS rewards_program_status_name,
      rewards_program_status.slug AS rewards_program_status_slug
    FROM individual_rewards_program_statuses
    JOIN LATERAL (
      SELECT view_topics.name, view_topics.slug
      FROM view_topics
      WHERE view_topics.id = individual_rewards_program_statuses.rewards_program_status_id
      LIMIT 1
    ) rewards_program_status ON TRUE
    WHERE individual_id = ${individual.id}`
  if (cursorId) query.append(sql` AND individual_rewards_program_statuses.id > ${cursorId}`)
  query.append(sql` ORDER BY individual_rewards_program_statuses.id ASC LIMIT ${limit + 1}`)
  const { rows } = await read<RewardsProgramStatusRow>(query)
  const results = rows.slice(0, limit).map(toRewardsProgramStatus)
  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage: rows.length > limit,
      getCursor: status => ({ id: status.id, scope }),
    }),
  }
}
