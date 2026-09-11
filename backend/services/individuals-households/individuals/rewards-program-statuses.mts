import { getOrCreateIndividual } from './individuals.mts'
import {
  toRewardsProgramStatus,
  type RewardsProgramStatusRow,
} from './rewards-program-statuses-row.mts'
export { getIndividualRewardsProgramStatuses } from './rewards-program-statuses-list.mts'
import { currentUserCanAccessUser } from '@services/users/authorization'
import { assertNotSuspended } from '@services/users/suspension'
import { read, write } from '@data-stores/psql'
import { parseUtcDay } from '@modules/utils'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'

type UpdateIndividualRewardsProgramStatusData = { since?: string | null; until?: string | null }

export async function getIndividualRewardsProgramStatusById(
  currentUser: PrivateUser | null,
  user: PrivateUser,
  id: string,
  options = {},
) {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanAccessUser(currentUser, user.id), 403, 'Forbidden')
  const individual = await getOrCreateIndividual(user)
  const { rows } = await read<RewardsProgramStatusRow>(
    sql`/* getIndividualRewardsProgramStatusById */
    SELECT individual_rewards_program_statuses.id, individual_rewards_program_statuses.since::TEXT AS since,
      individual_rewards_program_statuses.until::TEXT AS until, individual_rewards_program_statuses.rewards_program_status_id,
      view_topics.name AS rewards_program_status_name, view_topics.slug AS rewards_program_status_slug
    FROM individual_rewards_program_statuses JOIN view_topics ON view_topics.id = individual_rewards_program_statuses.rewards_program_status_id
    WHERE individual_rewards_program_statuses.id = ${id} AND individual_id = ${individual.id} LIMIT 1`,
    options,
  )
  return rows[0] ? toRewardsProgramStatus(rows[0]) : undefined
}

export async function createIndividualRewardsProgramStatus(
  currentUser: PrivateUser | null,
  user: PrivateUser,
  rewardsProgramStatusId: string,
) {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanAccessUser(currentUser, user.id), 403, 'Forbidden')
  assertNotSuspended(currentUser)
  const individual = await getOrCreateIndividual(user)
  let rows: { id: string }[]
  try {
    ;({ rows } = await write(
      sql`/* createIndividualRewardsProgramStatus */ INSERT INTO individual_rewards_program_statuses (individual_id, rewards_program_status_id) VALUES (${individual.id}, ${rewardsProgramStatusId}) RETURNING id`,
    ))
  } catch (error) {
    if ((error as { code?: string }).code === '23503')
      assert(false, 422, 'Invalid rewards_program_status_id')
    throw error
  }
  const status = await getIndividualRewardsProgramStatusById(currentUser, user, rows[0].id, {
    readOnly: false,
  })
  assert(status, 404, 'Not found')
  return status
}

export async function updateIndividualRewardsProgramStatusById(
  currentUser: PrivateUser | null,
  user: PrivateUser,
  id: string,
  data: UpdateIndividualRewardsProgramStatusData,
) {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanAccessUser(currentUser, user.id), 403, 'Forbidden')
  assertNotSuspended(currentUser)
  const individual = await getOrCreateIndividual(user)
  const sets: string[] = []
  const values: unknown[] = []
  if (data.since !== undefined) {
    assertValidRewardsProgramStatusDate(data.since, 'since')
    sets.push(`since = $${values.push(data.since)}`)
  }
  if (data.until !== undefined) {
    assertValidRewardsProgramStatusDate(data.until, 'until')
    sets.push(`until = $${values.push(data.until)}`)
  }
  if (
    data.since !== undefined &&
    data.since !== null &&
    data.until !== undefined &&
    data.until !== null
  )
    assert(data.since <= data.until, 422, 'since must be <= until')
  assert(sets.length > 0, 422, 'No valid fields provided')
  let rows: { id: string }[]
  try {
    ;({ rows } = await write(
      `/* updateIndividualRewardsProgramStatusById */ UPDATE individual_rewards_program_statuses SET ${sets.join(', ')} WHERE id = $${values.push(id)} AND individual_id = $${values.push(individual.id)} RETURNING id`,
      values,
    ))
  } catch (error) {
    if ((error as { code?: string }).code === '23514') assert(false, 422, 'since must be <= until')
    throw error
  }
  assert(rows[0], 404, 'Not found')
  const status = await getIndividualRewardsProgramStatusById(currentUser, user, rows[0].id, {
    readOnly: false,
  })
  assert(status, 404, 'Not found')
  return status
}

export async function deleteIndividualRewardsProgramStatusById(
  currentUser: PrivateUser | null,
  user: PrivateUser,
  id: string,
) {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanAccessUser(currentUser, user.id), 403, 'Forbidden')
  assertNotSuspended(currentUser)
  const individual = await getOrCreateIndividual(user)
  const { rows } = await write(
    sql`/* deleteIndividualRewardsProgramStatusById */ DELETE FROM individual_rewards_program_statuses WHERE id = ${id} AND individual_id = ${individual.id} RETURNING *`,
  )
  assert(rows[0], 404, 'Not found')
  return rows[0]
}

function assertValidRewardsProgramStatusDate(value: string | null, fieldName: string): void {
  if (value === null) return
  try {
    parseUtcDay(value)
  } catch {
    assert(false, 422, `${fieldName} must be a date in YYYY-MM-DD format`)
  }
}
