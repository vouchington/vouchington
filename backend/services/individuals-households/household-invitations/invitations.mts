import assert from 'http-assert'
import sql from 'sql-template-strings'
import { beginTransaction, read, write } from '@data-stores/psql'
import { decodeUuidCursor, isSimpleCursor } from '@modules/pagination'
import { validateUUID } from '@modules/utils/ids'
import { assertNotSuspended } from '@services/users'
import { getPublicUserByAny } from '@services/users/get'
import type { PrivateUser } from '@services/users/types'
import { enqueueCommunityLifecycleNotificationPush } from '@services/notifications'
import { createHouseholdInvitationNotifications } from '@services/notifications/create-household-invitation-notification'
import { getUserIdsBlockedOrMutedEitherWay } from '@services/entity-relations/check-block-mute'
import { readHouseholdMemberManageAccess } from '../authorization.mts'
import { page } from './page.mts'
import { invitationColumns, invitationJoins } from './projection.mts'

export type HouseholdInvitation = {
  id: string
  household_id: string
  invited_user_id: string
  invited_by_id: string
  invited_user: { id: string; username: string | null }
  invited_by: { id: string; username: string | null }
  household_owner: { id: string; username: string | null }
  relationship: string | null
  accepted_at: Date | null
  declined_at: Date | null
  revoked_at: Date | null
  created_at: Date
  updated_at: Date
}

function assertManageAccess(access: Awaited<ReturnType<typeof readHouseholdMemberManageAccess>>) {
  assert(access.access !== 'hidden', 404, 'Household not found')
  assert(access.access === 'allowed', 403, 'Only the household owner can manage invitations')
}

export async function createHouseholdInvitation(
  currentUser: PrivateUser,
  householdId: string,
  input: { user: string; relationship?: string },
): Promise<{ invitation: HouseholdInvitation; created: boolean }> {
  assertNotSuspended(currentUser)
  validateUUID(householdId)
  assert(
    typeof input.user === 'string' && input.user.length > 0,
    422,
    'Provide a user ID or username',
  )
  assert(
    input.relationship === undefined || Array.from(input.relationship).length <= 64,
    422,
    'Relationship is too long',
  )
  await using transaction = await beginTransaction()
  const options = { query: transaction }
  const { rows: lockedHouseholds } = await write<{ id: string; owner_user_id: string }>(
    sql`/* createHouseholdInvitation:lock-household */
      SELECT id, owner_user_id FROM households WHERE id = ${householdId} FOR UPDATE`,
    options,
  )
  assert(lockedHouseholds[0], 404, 'Household not found')
  assertManageAccess(await readHouseholdMemberManageAccess(currentUser, householdId, null, options))
  const invitedUser = await getPublicUserByAny(input.user, { ...options, readOnly: false })
  assert(invitedUser, 404, 'User not found')
  // The inviter and, for an administrator managing another owner's household, that owner.
  const blocked = await getUserIdsBlockedOrMutedEitherWay(
    invitedUser.id,
    [currentUser.id, lockedHouseholds[0].owner_user_id],
    options,
  )
  assert(blocked.size === 0, 404, 'User not found')
  assert(invitedUser.id !== currentUser.id, 422, 'You cannot invite yourself')
  assert(
    lockedHouseholds[0].owner_user_id !== invitedUser.id,
    409,
    'User is already a household member',
  )
  const { rows: existingMembers } = await write<{ exists: boolean }>(
    sql`/* createHouseholdInvitation:member */
      SELECT EXISTS (
        SELECT 1 FROM household_members hm
        JOIN users invited_user ON invited_user.individual_id = hm.individual_id
        WHERE hm.household_id = ${householdId} AND invited_user.id = ${invitedUser.id}
      ) AS exists`,
    options,
  )
  assert(!existingMembers[0]?.exists, 409, 'User is already a household member')
  const insert = sql`/* createHouseholdInvitation */
    WITH inserted AS (
      INSERT INTO household_invitations (household_id, invited_user_id, invited_by_id, relationship)
      VALUES (${householdId}, ${invitedUser.id}, ${currentUser.id}, ${input.relationship?.trim() ? input.relationship : null})
      ON CONFLICT (household_id, invited_user_id)
        WHERE accepted_at IS NULL AND declined_at IS NULL AND revoked_at IS NULL
        DO NOTHING
      RETURNING id, household_id, invited_user_id, invited_by_id, relationship,
        accepted_at, declined_at, revoked_at, created_at, updated_at
    )
    SELECT `
  insert.append(invitationColumns)
  insert.append(sql` FROM inserted hi `).append(invitationJoins)
  let { rows } = await write<HouseholdInvitation>(insert, options)
  const created = rows.length > 0
  if (rows.length === 0) {
    const existing = sql`/* createHouseholdInvitation:existing */ SELECT `
    existing.append(invitationColumns)
    existing.append(sql` FROM household_invitations hi `).append(invitationJoins).append(sql`
      WHERE hi.household_id = ${householdId} AND hi.invited_user_id = ${invitedUser.id}
        AND hi.accepted_at IS NULL AND hi.declined_at IS NULL AND hi.revoked_at IS NULL`)
    rows = (await write<HouseholdInvitation>(existing, options)).rows
  }
  const invitation = rows[0]
  assert(invitation, 409, 'Invitation changed; try again')
  const pushNotifications = await createHouseholdInvitationNotifications(
    created ? [{ userId: invitedUser.id, householdId, invitationId: invitation.id }] : [],
    options,
  )
  await transaction.commit()
  await enqueueCommunityLifecycleNotificationPush(pushNotifications)
  return { invitation, created }
}

export async function listHouseholdInvitations(
  currentUser: PrivateUser,
  householdId: string,
  options: { after?: string; limit: number },
) {
  validateUUID(householdId)
  assertManageAccess(await readHouseholdMemberManageAccess(currentUser, householdId))
  const after = options.after
    ? decodeUuidCursor(options.after, isSimpleCursor, 'Invalid invitation cursor').id
    : undefined
  const query = sql`/* listHouseholdInvitations */ SELECT `
  query.append(invitationColumns)
  query.append(sql` FROM household_invitations hi `).append(invitationJoins).append(sql`
    WHERE hi.household_id = ${householdId}
      AND hi.accepted_at IS NULL AND hi.declined_at IS NULL AND hi.revoked_at IS NULL`)
  if (after) query.append(sql` AND hi.id < ${after}`)
  query.append(sql` ORDER BY hi.id DESC LIMIT ${options.limit + 1}`)
  const { rows } = await read<HouseholdInvitation>(query)
  return page(rows, options.limit)
}

export async function listMyHouseholdInvitations(
  currentUser: PrivateUser,
  options: { after?: string; limit: number },
) {
  const after = options.after
    ? decodeUuidCursor(options.after, isSimpleCursor, 'Invalid invitation cursor').id
    : undefined
  const query = sql`/* listMyHouseholdInvitations */ SELECT `
  query.append(invitationColumns)
  query.append(sql` FROM household_invitations hi `).append(invitationJoins).append(sql`
    WHERE hi.invited_user_id = ${currentUser.id}
      AND hi.accepted_at IS NULL AND hi.declined_at IS NULL AND hi.revoked_at IS NULL`)
  if (after) query.append(sql` AND hi.id < ${after}`)
  query.append(sql` ORDER BY hi.id DESC LIMIT ${options.limit + 1}`)
  const { rows } = await read<HouseholdInvitation>(query)
  return page(rows, options.limit)
}

export async function revokeHouseholdInvitation(
  currentUser: PrivateUser,
  householdId: string,
  invitationId: string,
): Promise<void> {
  assertNotSuspended(currentUser)
  validateUUID(householdId)
  validateUUID(invitationId)
  await using transaction = await beginTransaction()
  const options = { query: transaction }
  assertManageAccess(await readHouseholdMemberManageAccess(currentUser, householdId, null, options))
  const { rows } = await write<{ id: string }>(
    sql`/* revokeHouseholdInvitation */
    UPDATE household_invitations SET revoked_at = CURRENT_TIMESTAMP
    WHERE id = ${invitationId} AND household_id = ${householdId}
      AND accepted_at IS NULL AND declined_at IS NULL AND revoked_at IS NULL
    RETURNING id`,
    options,
  )
  if (rows.length > 0) {
    await transaction.commit()
    return
  }
  const { rows: existing } = await write<{ id: string }>(
    sql`/* revokeHouseholdInvitation:existing */
    SELECT id FROM household_invitations
    WHERE id = ${invitationId} AND household_id = ${householdId}`,
    options,
  )
  assert(existing[0], 404, 'Invitation not found')
  assert(false, 409, 'Invitation is no longer pending')
}
