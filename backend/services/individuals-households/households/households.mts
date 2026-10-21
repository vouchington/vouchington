import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { validateUUID } from '@modules/utils/ids'
import type { PrivateUser } from '@services/users/types'
import type { HouseholdMembershipRow, HouseholdRow } from '../types.mts'
import {
  currentUserCanViewHousehold,
  currentUserCanDeleteHousehold,
  readHouseholdMemberManageAccess,
} from '../authorization.mts'
import {
  membershipIndividualSql,
  membershipUpdatedAtSql,
} from './household-membership-page-row.mts'

async function getHouseholdById(householdId: string) {
  const { rows } = await read<HouseholdRow>(sql`/* getHouseholdById */
    SELECT
      id,
      owner_user_id,
      updated_at
    FROM households
    WHERE id = ${householdId}
  `)
  return rows[0] || null
}
export async function getOrCreateHousehold(currentUser: PrivateUser | null) {
  assert(currentUser, 401, 'User not logged in')
  const { rows: households } = await read<HouseholdRow>(sql`/* getOrCreateHousehold */
    SELECT
      id,
      owner_user_id,
      updated_at
    FROM households
    WHERE owner_user_id = ${currentUser.id}
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `)
  if (households.length > 0) {
    return households[0]
  }
  const {
    rows: [household],
  } = await write<HouseholdRow>(sql`/* getOrCreateHousehold */
    INSERT INTO households (owner_user_id) VALUES (${currentUser.id})
    RETURNING id, owner_user_id, updated_at
  `)
  return household
}
export async function createHousehold(currentUser: PrivateUser | null) {
  assert(currentUser, 401, 'User not logged in')
  const { rows } = await write<HouseholdRow>(sql`/* createHousehold */
    INSERT INTO households (owner_user_id)
    VALUES (${currentUser.id})
    RETURNING id, owner_user_id, updated_at
  `)
  return rows[0]
}
export async function getHousehold(currentUser: PrivateUser | null, householdId: string) {
  assert(currentUser, 401, 'User not logged in')
  validateUUID(householdId)
  const household = await getHouseholdById(householdId)
  assert(household, 404, 'Household not found')
  const canView = await currentUserCanViewHousehold(currentUser, householdId)
  assert(canView, 404, 'Household not found')
  return household
}
export async function deleteHousehold(currentUser: PrivateUser | null, householdId: string) {
  assert(currentUser, 401, 'User not logged in')
  validateUUID(householdId)
  const household = await getHouseholdById(householdId)
  assert(household, 404, 'Household not found')
  const canDelete = await currentUserCanDeleteHousehold(currentUser, householdId)
  assert(canDelete, 404, 'Household not found')
  await write(sql`/* deleteHousehold */
    DELETE FROM households WHERE id = ${householdId}
  `)
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

  const query = sql`/* addHouseholdMembership */
    WITH inserted AS (
      INSERT INTO household_members (household_id, individual_id, relationship)
      VALUES (${householdId}, ${individualId}, ${relationship || null})
      ON CONFLICT ON CONSTRAINT uniq_household_members__household_id_individual_id DO UPDATE
      SET relationship = COALESCE(EXCLUDED.relationship, household_members.relationship)
      RETURNING id, household_id, individual_id, relationship, updated_at
    )
    SELECT
      inserted.id,
      inserted.household_id,
      inserted.relationship, `
  query.append(membershipUpdatedAtSql('inserted'))
  query.append(sql` AS updated_at, `)
  query.append(membershipIndividualSql('i', 'u'))
  query.append(sql` AS individual
    FROM inserted
    LEFT JOIN individuals i ON i.id = inserted.individual_id
    LEFT JOIN users u ON u.individual_id = i.id`)
  const { rows } = await write<HouseholdMembershipRow>(query)
  const membership = rows[0]
  assert(membership, 500, 'Household membership was not saved')
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

  const { rowCount } = await write(sql`/* removeHouseholdMembership */
    DELETE FROM household_members WHERE household_id = ${householdId} AND id = ${membershipId}
  `)

  assert(rowCount && rowCount > 0, 404, 'Membership not found')
}
