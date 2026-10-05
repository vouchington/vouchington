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

type UpdateIndividualRewardsProgramStatusData = {
  started_on?: string | null
  expires_on?: string | null
}

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
    SELECT individual_rewards_program_statuses.id, individual_rewards_program_statuses.started_on::TEXT AS started_on,
      individual_rewards_program_statuses.expires_on::TEXT AS expires_on, individual_rewards_program_statuses.rewards_program_status_id,
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
  } catch (err) {
    if ((err as { code?: string }).code === '23503')
      assert(false, 422, 'Invalid rewards_program_status_id')
    throw err
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
  if (data.started_on !== undefined) {
    assertValidRewardsProgramStatusDate(data.started_on, 'started_on')
    sets.push(`started_on = $${values.push(data.started_on)}`)
  }
  if (data.expires_on !== undefined) {
    assertValidRewardsProgramStatusDate(data.expires_on, 'expires_on')
    sets.push(`expires_on = $${values.push(data.expires_on)}`)
  }
  if (
    data.started_on !== undefined &&
    data.started_on !== null &&
    data.expires_on !== undefined &&
    data.expires_on !== null
  )
    assert(data.started_on <= data.expires_on, 422, 'started_on must be <= expires_on')
  assert(sets.length > 0, 422, 'No valid fields provided')
  let rows: { id: string }[]
  try {
    ;({ rows } = await write(
      `/* updateIndividualRewardsProgramStatusById */ UPDATE individual_rewards_program_statuses SET ${sets.join(', ')} WHERE id = $${values.push(id)} AND individual_id = $${values.push(individual.id)} RETURNING id`,
      values,
    ))
  } catch (err) {
    if ((err as { code?: string }).code === '23514')
      assert(false, 422, 'started_on must be <= expires_on')
    throw err
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
