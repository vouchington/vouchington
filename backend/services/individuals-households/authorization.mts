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
      h.owner_user_id = ${currentUser.id} AS is_owner,
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
    SELECT owner_user_id FROM households WHERE id = ${householdId}
  `)

  if (rows.length === 0) return false
  return rows[0].owner_user_id === currentUser.id
}

export async function currentUserCanDeleteHousehold(
  currentUser: PrivateUser | null,
  householdId: string,
): Promise<boolean> {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true

  const { rows } = await read(sql`/* currentUserCanDeleteHousehold */
    SELECT owner_user_id FROM households WHERE id = ${householdId}
  `)

  if (rows.length === 0) return false
  return rows[0].owner_user_id === currentUser.id
}

export type HouseholdMemberManageAccess = 'hidden' | 'forbidden' | 'allowed'

/**
 * Whether the caller may manage members. A missing household and a household the caller cannot
 * see are both `hidden`, so callers can return 404 without disclosing existence. A visible
 * household the caller does not own is `forbidden`.
 */
export async function readHouseholdMemberManageAccess(
  currentUser: PrivateUser,
  householdId: string,
  individualId: string | null = null,
): Promise<{ access: HouseholdMemberManageAccess; individualExists: boolean }> {
  const isAdministrator = currentUser.roles.includes('administrator')
  const { rows } = await read<{
    can_view: boolean
    can_manage: boolean
    individual_exists: boolean
  }>(
    sql`/* readHouseholdMemberManageAccess */
      SELECT
        CASE
          WHEN h.id IS NULL THEN FALSE
          WHEN ${isAdministrator} THEN TRUE
          ELSE (
            h.owner_user_id = ${currentUser.id}
            OR (
              ${currentUser.individual_id}::uuid IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM household_members hm
                WHERE hm.household_id = h.id
                  AND hm.individual_id = ${currentUser.individual_id}::uuid
              )
            )
          )
        END AS can_view,
        CASE
          WHEN h.id IS NULL THEN FALSE
          WHEN ${isAdministrator} THEN TRUE
          ELSE h.owner_user_id = ${currentUser.id}
        END AS can_manage,
        (
          ${individualId}::uuid IS NULL
          OR EXISTS (
            SELECT 1 FROM individuals individual_row WHERE individual_row.id = ${individualId}::uuid
          )
        ) AS individual_exists
      FROM (VALUES (TRUE)) AS singleton(singleton_value)
      LEFT JOIN households h ON h.id = ${householdId}
    `,
  )
  const row = rows[0]
  const individualExists = row?.individual_exists === true
  if (!row?.can_view) return { access: 'hidden', individualExists }
  if (!row.can_manage) return { access: 'forbidden', individualExists }
  return { access: 'allowed', individualExists }
}
