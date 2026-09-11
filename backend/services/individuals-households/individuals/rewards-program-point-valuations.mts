import { getOrCreateIndividual } from './individuals.mts'
import {
  toPointValuation,
  type PointValuationRow,
} from './rewards-program-point-valuations-row.mts'
export { getIndividualRewardsProgramPointValuations } from './rewards-program-point-valuations-list.mts'
import { currentUserCanAccessUser } from '@services/users/authorization'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import type { IndividualRewardsProgramPointValuation } from './rewards-program-point-valuations-types.mts'
import { isScaledMoney, MAX_POINT_VALUE_MICROUNITS, type ScaledMoney } from '@ts-shared/money'

const duplicatePointValuationConstraintNames = new Set([
  'uq_ind_rp_point_valuations__individual_rewards_program',
  'uq_individual_rewards_program_point_valuations__individual_rewa',
])

export const isDuplicatePointValuationConstraint = (constraint: string | undefined) =>
  constraint !== undefined && duplicatePointValuationConstraintNames.has(constraint)

type CreateIndividualRewardsProgramPointValuationData = {
  value_per_point: ScaledMoney
  note?: string
}

type UpdateIndividualRewardsProgramPointValuationData = {
  value_per_point?: ScaledMoney
  note?: string | null
}

const getIndividualRewardsProgramPointValuationById = async (
  currentUser: PrivateUser | null,
  user: PrivateUser,
  id: string,
  options = {},
): Promise<IndividualRewardsProgramPointValuation> => {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanAccessUser(currentUser, user.id), 403, 'Forbidden')
  const individual = await getOrCreateIndividual(user)
  const { rows } = await read<PointValuationRow>(
    sql`/* getIndividualRewardsProgramPointValuationById */
    SELECT
      individual_rewards_program_point_valuations.id,
      individual_rewards_program_point_valuations.rewards_program_id,
      individual_rewards_program_point_valuations.value_microunits_per_point::TEXT AS value_microunits_per_point,
      individual_rewards_program_point_valuations.currency_code,
      individual_rewards_program_point_valuations.note,
      view_topics.name AS rewards_program_name,
      view_topics.slug AS rewards_program_slug
    FROM individual_rewards_program_point_valuations
    JOIN view_topics
      ON view_topics.id = individual_rewards_program_point_valuations.rewards_program_id
    WHERE individual_rewards_program_point_valuations.id = ${id}
      AND individual_id = ${individual.id}
    LIMIT 1
  `,
    options,
  )
  assert(rows[0], 404, 'Not found')
  return toPointValuation(rows[0])
}

export const createIndividualRewardsProgramPointValuation = async (
  currentUser: PrivateUser | null,
  user: PrivateUser,
  rewardsProgramId: string,
  data: CreateIndividualRewardsProgramPointValuationData,
) => {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanAccessUser(currentUser, user.id), 403, 'Forbidden')
  assertPointValuation(
    data.value_per_point,
    'value_per_point is required and must be valid scale-six money',
  )
  const individual = await getOrCreateIndividual(user)
  let rows: { id: string }[]
  try {
    ;({ rows } = await write(sql`/* createIndividualRewardsProgramPointValuation */
      INSERT INTO individual_rewards_program_point_valuations (
        individual_id,
        rewards_program_id,
        value_microunits_per_point,
        currency_code,
        note
      )
      VALUES (
        ${individual.id},
        ${rewardsProgramId},
        ${data.value_per_point.amount},
        ${data.value_per_point.currency},
        ${data.note ?? null}
      )
      RETURNING id
    `))
  } catch (error) {
    const pgError = error as { code?: string; constraint?: string }
    if (pgError.code === '23503') {
      assert(false, 422, 'Invalid rewards_program_id')
    }
    if (pgError.code === '23505' && isDuplicatePointValuationConstraint(pgError.constraint)) {
      assert(false, 409, 'You already have a valuation for this rewards program')
    }
    throw error
  }
  return getIndividualRewardsProgramPointValuationById(currentUser, user, rows[0].id, {
    readOnly: false,
  })
}

export const updateIndividualRewardsProgramPointValuationById = async (
  currentUser: PrivateUser | null,
  user: PrivateUser,
  id: string,
  data: UpdateIndividualRewardsProgramPointValuationData,
) => {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanAccessUser(currentUser, user.id), 403, 'Forbidden')
  const individual = await getOrCreateIndividual(user)
  const sets: string[] = []
  const values: unknown[] = []

  if (data.value_per_point !== undefined) {
    assertPointValuation(data.value_per_point, 'value_per_point must be valid scale-six money')
    sets.push(`value_microunits_per_point = $${values.push(data.value_per_point.amount)}`)
    sets.push(`currency_code = $${values.push(data.value_per_point.currency)}`)
  }
  if (data.note !== undefined) {
    sets.push(`note = $${values.push(data.note || null)}`)
  }

  assert(sets.length > 0, 422, 'No valid fields provided')

  const query = `/* updateIndividualRewardsProgramPointValuationById */
    UPDATE individual_rewards_program_point_valuations
    SET ${sets.join(', ')}
    WHERE id = $${values.push(id)}
      AND individual_id = $${values.push(individual.id)}
    RETURNING id
  `

  const { rows } = await write<{ id: string }>(query, values)
  assert(rows[0], 404, 'Not found')
  return getIndividualRewardsProgramPointValuationById(currentUser, user, rows[0].id, {
    readOnly: false,
  })
}

export const deleteIndividualRewardsProgramPointValuationById = async (
  currentUser: PrivateUser | null,
  user: PrivateUser,
  id: string,
) => {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanAccessUser(currentUser, user.id), 403, 'Forbidden')
  const individual = await getOrCreateIndividual(user)
  const { rows } = await write(sql`/* deleteIndividualRewardsProgramPointValuationById */
    DELETE FROM individual_rewards_program_point_valuations
    WHERE id = ${id}
      AND individual_id = ${individual.id}
    RETURNING *
  `)
  assert(rows[0], 404, 'Not found')
  return rows[0]
}

function assertPointValuation(
  value: unknown,
  invalidMessage: string,
): asserts value is ScaledMoney {
  assert(isScaledMoney(value), 422, invalidMessage)
  assert(value.amount <= MAX_POINT_VALUE_MICROUNITS, 422, 'value_per_point exceeds the maximum')
}
