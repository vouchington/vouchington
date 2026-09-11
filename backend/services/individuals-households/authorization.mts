import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PrivateUser, UserPrivacyAudience } from '@services/users/types'
import { currentUserCanViewUserContent } from '@services/users/authorization'

export async function currentUserCanViewUsersSpendingCategories(
  currentUser: PrivateUser | null,
  targetUserId: string,
): Promise<boolean> {
  if (currentUser?.roles.includes('administrator')) return true
  if (currentUser?.id === targetUserId) return true

  const { rows } = await read(sql`/* currentUserCanViewUsersSpendingCategories */
    SELECT spending_categories_visibility FROM users WHERE id = ${targetUserId}
  `)
  const visibility = (rows[0]?.spending_categories_visibility ?? 'nobody') as UserPrivacyAudience
  return currentUserCanViewUserContent(currentUser, targetUserId, visibility)
}

export function currentUserCanEditUsersSpendingCategories(
  currentUser: PrivateUser | null,
  targetUserId: string,
): boolean {
  if (currentUser?.roles.includes('administrator')) return true
  return currentUser?.id === targetUserId
}

export async function currentUserCanViewHousehold(
  currentUser: PrivateUser | null,
  householdId: string,
): Promise<boolean> {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true

  const { rows } = await read(sql`/* currentUserCanViewHousehold */
    SELECT
      h.owner_id = ${currentUser.id} AS is_owner,
      (
        ${currentUser.individual_id}::uuid IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM household_members hm
          WHERE hm.household_id = h.id
            AND hm.individual_id = ${currentUser.individual_id}::uuid
        )
      ) AS is_member
    FROM households h
    WHERE h.id = ${householdId}
  `)

  if (rows.length === 0) return false
  return rows[0].is_owner || rows[0].is_member
}

export async function currentUserCanUpdateHousehold(
  currentUser: PrivateUser | null,
  householdId: string,
): Promise<boolean> {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true

  const { rows } = await read(sql`/* currentUserCanUpdateHousehold */
    SELECT owner_id FROM households WHERE id = ${householdId}
  `)

  if (rows.length === 0) return false
  return rows[0].owner_id === currentUser.id
}

export async function currentUserCanDeleteHousehold(
  currentUser: PrivateUser | null,
  householdId: string,
): Promise<boolean> {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true

  const { rows } = await read(sql`/* currentUserCanDeleteHousehold */
    SELECT owner_id FROM households WHERE id = ${householdId}
  `)

  if (rows.length === 0) return false
  return rows[0].owner_id === currentUser.id
}

export async function currentUserCanManageHouseholdMembers(
  currentUser: PrivateUser | null,
  householdId: string,
): Promise<boolean> {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true

  const { rows } = await read(sql`/* currentUserCanManageHouseholdMembers */
    SELECT owner_id FROM households WHERE id = ${householdId}
  `)

  if (rows.length === 0) return false
  return rows[0].owner_id === currentUser.id
}
