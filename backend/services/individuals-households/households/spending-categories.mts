import {
  currentUserCanEditUsersSpendingCategories,
  currentUserCanUpdateHousehold,
} from '../authorization.mts'
import { spendingFrequencyTypes } from '../types.mts'
import { getOrCreateIndividual } from '../individuals/individuals.mts'
import {
  getHouseholdSpendingCategoryById,
  getSpendingEntryOwnership,
} from './spending-categories-get.mts'
import { write } from '@data-stores/psql'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { isMoney, type Money } from '@ts-shared/money'
type SpendingCategoryData = {
  amount: Money
  spending_frequency?: 'monthly' | 'annually'
  note?: string
}
type UpdateSpendingCategoryData = {
  amount?: Money
  spending_frequency?: 'monthly' | 'annually'
  note?: string | null
}
export async function createHouseholdSpendingCategory(
  currentUser: PrivateUser | null,
  user: PrivateUser,
  spendingCategoryId: string,
  data: SpendingCategoryData,
  householdId?: string,
) {
  assert(currentUser, 401)
  assert(isMoney(data.amount), 422, 'amount is required and must be valid money')
  let ownerField: string
  let ownerValue: string
  if (householdId) {
    assert(await currentUserCanUpdateHousehold(currentUser, householdId), 403)
    ownerField = 'household_id'
    ownerValue = householdId
  } else {
    assert(currentUserCanEditUsersSpendingCategories(currentUser, user.id), 403)
    const individual = await getOrCreateIndividual(user)
    ownerField = 'individual_id'
    ownerValue = individual.id
  }
  const fields = [ownerField, 'spending_category_id', 'amount_minor_units', 'currency_code']
  const values: unknown[] = [
    ownerValue,
    spendingCategoryId,
    data.amount.amount,
    data.amount.currency,
  ]
  if (typeof data.spending_frequency === 'string') {
    assert(
      Object.keys(spendingFrequencyTypes).includes(data.spending_frequency),
      422,
      `spending_frequency must be one of: ${Object.keys(spendingFrequencyTypes)
        .map(x => spendingFrequencyTypes[x as keyof typeof spendingFrequencyTypes].slug)
        .join(', ')}`,
    )
    fields.push('spending_frequency')
    values.push(data.spending_frequency)
  }
  if (typeof data.note === 'string') {
    fields.push('note')
    values.push(data.note)
  }
  let rows: { id: string }[]
  try {
    ;({ rows } = await write(
      `/* createHouseholdSpendingCategory */
      -- Dynamic optional columns still produce exactly one spending-entry VALUES row.
      /* no-mistakes: deadlock-safe */
      INSERT INTO spending_entries (${fields.join(', ')})
      VALUES (${values.map((_value, index) => `$${index + 1}`).join(', ')})
      RETURNING id
    `,
      values,
    ))
  } catch (error) {
    const pgError = error as { code?: string; constraint?: string }
    if (pgError.code === '23503') {
      if (pgError.constraint?.includes('household_id')) {
        assert(false, 422, 'Invalid household_id')
      }
      assert(false, 422, 'Invalid spending_category_id')
    }
    throw error
  }
  return getHouseholdSpendingCategoryById(currentUser, user, rows[0].id, { readOnly: false })
}
export async function updateHouseholdSpendingCategoryById(
  currentUser: PrivateUser | null,
  user: PrivateUser,
  householdSpendingCategoryId: string,
  data: UpdateSpendingCategoryData,
) {
  assert(currentUser, 401)
  const sets: string[] = []
  const values: unknown[] = []

  if (data.spending_frequency !== undefined) {
    assert(
      Object.keys(spendingFrequencyTypes).includes(data.spending_frequency),
      422,
      `spending_frequency must be one of: ${Object.keys(spendingFrequencyTypes)
        .map(x => spendingFrequencyTypes[x as keyof typeof spendingFrequencyTypes].slug)
        .join(', ')}`,
    )
    sets.push(`spending_frequency = $${values.push(data.spending_frequency)}`)
  }

  if (data.amount !== undefined) {
    assert(isMoney(data.amount), 422, 'amount must be valid money')
    sets.push(`amount_minor_units = $${values.push(data.amount.amount)}`)
    sets.push(`currency_code = $${values.push(data.amount.currency)}`)
  }

  if (data.note !== undefined) {
    sets.push(`note = $${values.push(data.note || null)}`)
  }

  assert(sets.length > 0, 422, 'No valid fields provided')

  const ownership = await getSpendingEntryOwnership(householdSpendingCategoryId)
  assert(ownership, 404, 'Not found')

  if (ownership.household_id) {
    assert(await currentUserCanUpdateHousehold(currentUser, ownership.household_id), 403)
  } else {
    assert(
      currentUser.roles.includes('administrator') ||
        ownership.individual_id === currentUser.individual_id,
      403,
    )
  }

  const query = `/* updateHouseholdSpendingCategoryById */
    UPDATE spending_entries
    SET ${sets.join(', ')}
    WHERE id = $${values.push(householdSpendingCategoryId)}
    RETURNING id
  `

  const { rows } = await write<{ id: string }>(query, values)
  assert(rows[0], 404, 'Not found')
  return getHouseholdSpendingCategoryById(currentUser, user, rows[0].id, { readOnly: false })
}

export async function deleteHouseholdSpendingCategoryById(
  currentUser: PrivateUser | null,
  householdSpendingCategoryId: string,
) {
  assert(currentUser, 401)

  const ownership = await getSpendingEntryOwnership(householdSpendingCategoryId)
  assert(ownership, 404, 'Not found')

  if (ownership.household_id) {
    assert(await currentUserCanUpdateHousehold(currentUser, ownership.household_id), 403)
  } else {
    assert(
      currentUser.roles.includes('administrator') ||
        ownership.individual_id === currentUser.individual_id,
      403,
    )
  }

  const { rows } = await write(
    `/* deleteHouseholdSpendingCategoryById */
    DELETE FROM spending_entries
    WHERE id = $1
    RETURNING *
    `,
    [householdSpendingCategoryId],
  )
  assert(rows[0], 404, 'Not found')
  return rows[0]
}
