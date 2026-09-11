import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { validateUUID } from '@modules/utils/ids'
import type { PrivateUser } from '@services/users/types'
import type { HouseholdRow } from '../types.mts'
import {
  currentUserCanViewHousehold,
  currentUserCanUpdateHousehold,
  currentUserCanDeleteHousehold,
  currentUserCanManageHouseholdMembers,
} from '../authorization.mts'

async function getHouseholdById(householdId: string) {
  const { rows } = await read<HouseholdRow>(sql`/* getHouseholdById */
    SELECT
      id,
      owner_id,
      updated_at
    FROM households
    WHERE id = ${householdId}
  `)
  return rows[0] || null
}
async function verifyIndividualExists(individualId: string): Promise<boolean> {
  const { rows } = await read(sql`/* verifyIndividualExists */
    SELECT 1 FROM individuals WHERE id = ${individualId} LIMIT 1
  `)
  return rows.length > 0
}
export async function getOrCreateHousehold(currentUser: PrivateUser | null) {
  assert(currentUser, 401, 'User not logged in')
  const { rows: households } = await read<HouseholdRow>(sql`/* getOrCreateHousehold */
    SELECT
      id,
      owner_id,
      updated_at
    FROM households
    WHERE owner_id = ${currentUser.id}
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `)
  if (households.length > 0) {
    return households[0]
  }
  const {
    rows: [household],
  } = await write<HouseholdRow>(sql`/* getOrCreateHousehold */
    INSERT INTO households (owner_id) VALUES (${currentUser.id}) RETURNING *
  `)
  return household
}
export async function createHousehold(currentUser: PrivateUser | null) {
  assert(currentUser, 401, 'User not logged in')
  const { rows } = await write<HouseholdRow>(sql`/* createHousehold */
    INSERT INTO households (owner_id)
    VALUES (${currentUser.id})
    RETURNING *
  `)
  return rows[0]
}
export async function getHousehold(currentUser: PrivateUser | null, householdId: string) {
  assert(currentUser, 401, 'User not logged in')
  validateUUID(householdId)
  const household = await getHouseholdById(householdId)
  assert(household, 404, 'Household not found')
  const canView = await currentUserCanViewHousehold(currentUser, householdId)
  assert(canView, 403, 'Forbidden')
  return household
}
export async function updateHousehold(currentUser: PrivateUser | null, householdId: string) {
  validateUUID(householdId)
  const household = await getHouseholdById(householdId)
  assert(household, 404, 'Household not found')
  const canUpdate = await currentUserCanUpdateHousehold(currentUser, householdId)
  assert(canUpdate, 403, 'Only household owner can update')
  // Currently households table only has owner_id and timestamps
  // No other updatable fields yet - return existing household
  return household
}
export async function deleteHousehold(currentUser: PrivateUser | null, householdId: string) {
  validateUUID(householdId)
  const household = await getHouseholdById(householdId)
  assert(household, 404, 'Household not found')
  const canDelete = await currentUserCanDeleteHousehold(currentUser, householdId)
  assert(canDelete, 403, 'Only household owner can delete')
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
  const canManage = await currentUserCanManageHouseholdMembers(currentUser, householdId)
  assert(canManage, 403, 'Only household owner can add members')
  assert(
    currentUser.roles?.includes('administrator') || currentUser.individual_id === individualId,
    403,
    'Cannot add another user to a household without an invitation',
  )

  const exists = await verifyIndividualExists(individualId)
  assert(exists, 404, 'Individual not found')

  const { rows } = await write(sql`/* addHouseholdMembership */
    INSERT INTO household_members (household_id, individual_id, relationship)
    VALUES (${householdId}, ${individualId}, ${relationship || null})
    ON CONFLICT ON CONSTRAINT uniq_household_members__household_id_individual_id DO UPDATE
    SET relationship = ${relationship || null}
    RETURNING
      id,
      household_id,
      relationship,
      updated_at,
      (
        SELECT json_build_object(
          'id', i.id,
          'updated_at', i.updated_at
        )
        FROM individuals i
        WHERE i.id = household_members.individual_id
      ) AS individual
  `)

  return rows[0]
}
export async function removeHouseholdMembership(
  currentUser: PrivateUser | null,
  householdId: string,
  membershipId: string,
) {
  validateUUID(householdId)
  validateUUID(membershipId)

  const canManage = await currentUserCanManageHouseholdMembers(currentUser, householdId)
  assert(canManage, 403, 'Only household owner can remove members')

  const { rowCount } = await write(sql`/* removeHouseholdMembership */
    DELETE FROM household_members WHERE household_id = ${householdId} AND id = ${membershipId}
  `)

  assert(rowCount && rowCount > 0, 404, 'Membership not found')
}
