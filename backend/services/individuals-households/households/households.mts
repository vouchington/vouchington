import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { validateUUID } from '@modules/utils/ids'
import type { PrivateUser } from '@services/users/types'
import { insertHouseholdMember, insertOwnedHousehold } from '../household-limits.mts'
import { getOrCreateIndividual } from '../individuals/individuals.mts'
import type { HouseholdMembershipRow, HouseholdRow } from '../types.mts'
import { readHouseholdMemberManageAccess } from '../authorization.mts'
import {
  membershipIndividualSql,
  membershipUpdatedAtSql,
} from './household-membership-page-row.mts'

export async function createHousehold(currentUser: PrivateUser | null) {
  assert(currentUser, 401, 'User not logged in')
  await using transaction = await beginTransaction()
  const options = { query: transaction }
  const household = await insertOwnedHousehold(currentUser.id, options)
  // Every owned household gives its owner a membership, which counts toward the individual cap.
  const individual = await getOrCreateIndividual(currentUser, options)
  assert(individual, 500, 'Household owner has no individual')
  await insertHouseholdMember(
    { householdId: household.id, individualId: individual.id, relationship: null },
    options,
  )
  await transaction.commit()
  return household
}
export async function getHousehold(currentUser: PrivateUser | null, householdId: string) {
  assert(currentUser, 401, 'User not logged in')
  validateUUID(householdId)
  const isAdministrator = currentUser.roles.includes('administrator')
  const { rows } = await read<HouseholdRow>(sql`/* getHousehold */
    SELECT h.id, h.owner_user_id, h.updated_at
    FROM households h
    WHERE h.id = ${householdId}
      AND (
        ${isAdministrator}
        OR h.owner_user_id = ${currentUser.id}
        OR (
          ${currentUser.individual_id}::uuid IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM household_members hm
            WHERE hm.household_id = h.id
              AND hm.individual_id = ${currentUser.individual_id}::uuid
          )
        )
      )
    LIMIT 1
  `)
  const household = rows[0]
  assert(household, 404, 'Household not found')
  return household
}
export async function deleteHousehold(currentUser: PrivateUser | null, householdId: string) {
  assert(currentUser, 401, 'User not logged in')
  validateUUID(householdId)
  const isAdministrator = currentUser.roles.includes('administrator')
  const { rows } = await write(sql`/* deleteHousehold */
    DELETE FROM households
    WHERE id = ${householdId}
      AND (${isAdministrator} OR owner_user_id = ${currentUser.id})
    RETURNING id
  `)
  assert(rows.length > 0, 404, 'Household not found')
}
export async function addHouseholdMembership(
  currentUser: PrivateUser | null,
  householdId: string,
  individualId: string,
  relationship?: string,
) {
  assert(currentUser, 401, 'User not logged in')
  validateUUID(householdId)
  validateUUID(individualId)
  const { access, individualExists } = await readHouseholdMemberManageAccess(
    currentUser,
    householdId,
    individualId,
  )
  assert(access !== 'hidden', 404, 'Household not found')
  assert(access === 'allowed', 403, 'Only household owner can add members')
  assert(
    currentUser.roles?.includes('administrator') || currentUser.individual_id === individualId,
    403,
    'Invite another user to the household before adding them as a member',
  )
  assert(individualExists, 404, 'Individual not found')

  await using transaction = await beginTransaction()
  const options = { query: transaction }
  const inserted = await insertHouseholdMember(
    { householdId, individualId, relationship: relationship || null },
    options,
  )
  if (!inserted) {
    await write(
      sql`/* addHouseholdMembership:update */
        UPDATE household_members
        SET relationship = COALESCE(${relationship || null}, relationship)
        WHERE household_id = ${householdId} AND individual_id = ${individualId}`,
      options,
    )
  }
  const query = sql`/* addHouseholdMembership */
    SELECT
      hm.id,
      hm.household_id,
      hm.relationship, `
  query.append(membershipUpdatedAtSql('hm'))
  query.append(sql` AS updated_at, `)
  query.append(membershipIndividualSql('i', 'u'))
  query.append(sql` AS individual
    FROM household_members hm
    LEFT JOIN individuals i ON i.id = hm.individual_id
    LEFT JOIN users u ON u.individual_id = i.id
    WHERE hm.household_id = ${householdId} AND hm.individual_id = ${individualId}`)
  const { rows } = await write<HouseholdMembershipRow>(query, options)
  const membership = rows[0]
  assert(membership, 500, 'Household membership was not saved')
  await transaction.commit()
  return membership
}
export async function removeHouseholdMembership(
  currentUser: PrivateUser | null,
  householdId: string,
  membershipId: string,
) {
  assert(currentUser, 401, 'User not logged in')
  validateUUID(householdId)
  validateUUID(membershipId)
  const { access } = await readHouseholdMemberManageAccess(currentUser, householdId)
  assert(access !== 'hidden', 404, 'Household not found')
  assert(access === 'allowed', 403, 'Only household owner can remove members')

  // The owner's membership holds the owner's individual slot, so it stays while the household exists.
  const { rowCount } = await write(sql`/* removeHouseholdMembership */
    DELETE FROM household_members hm
    WHERE hm.household_id = ${householdId} AND hm.id = ${membershipId}
      AND NOT EXISTS (
        SELECT 1 FROM households h JOIN users u ON u.id = h.owner_user_id
        WHERE h.id = hm.household_id AND u.individual_id = hm.individual_id
      )
  `)
  if (!rowCount) {
    const { rows: ownerRows } = await read(sql`/* removeHouseholdMembership:owner */
      SELECT 1 FROM household_members hm
      JOIN households h ON h.id = hm.household_id
      JOIN users u ON u.id = h.owner_user_id AND u.individual_id = hm.individual_id
      WHERE hm.household_id = ${householdId} AND hm.id = ${membershipId}`)
    assert(ownerRows.length === 0, 409, 'Household owner cannot be removed')
  }
  assert(rowCount && rowCount > 0, 404, 'Membership not found')
}
