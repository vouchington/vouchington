import assert from 'http-assert'
import sql from 'sql-template-strings'
import { beginTransaction, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { validateUUID } from '@modules/utils/ids'
import { assertNotSuspended } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import { getUserIdsBlockedOrMutedEitherWay } from '@services/entity-relations/check-block-mute'
import type { HouseholdMembershipRow } from '../types.mts'
import {
  membershipIndividualSql,
  membershipUpdatedAtSql,
} from '../households/household-membership-page-row.mts'
import { getOrCreateIndividual } from '../individuals/individuals.mts'

async function getOrCreateLockedInviteeIndividual(currentUser: PrivateUser, options: QueryOptions) {
  await write(
    sql`/* decideHouseholdInvitation:lock-invitee */
      SELECT id FROM users WHERE id = ${currentUser.id} FOR UPDATE`,
    options,
  )
  return getOrCreateIndividual(currentUser, options)
}

export async function decideHouseholdInvitation(
  currentUser: PrivateUser,
  invitationId: string,
  decision: 'accept' | 'decline',
): Promise<{ membership: HouseholdMembershipRow } | void> {
  assertNotSuspended(currentUser)
  validateUUID(invitationId)
  await using transaction = await beginTransaction()
  const options = { query: transaction }
  const { rows: households } = await write<{
    id: string
    owner_user_id: string
    invited_by_id: string
  }>(
    sql`/* decideHouseholdInvitation:lock-household */
      SELECT h.id, h.owner_user_id, hi.invited_by_id
      FROM households h
      JOIN household_invitations hi ON hi.household_id = h.id
      WHERE hi.id = ${invitationId} AND hi.invited_user_id = ${currentUser.id}
      FOR UPDATE OF h`,
    options,
  )
  const household = households[0]
  assert(household, 404, 'Invitation not found')
  if (decision === 'accept') {
    const blocked = await getUserIdsBlockedOrMutedEitherWay(
      currentUser.id,
      [household.invited_by_id, household.owner_user_id],
      options,
    )
    assert(blocked.size === 0, 404, 'Invitation not found')
  }
  const update =
    decision === 'accept'
      ? sql`/* decideHouseholdInvitation:accept */
      UPDATE household_invitations SET accepted_at = CURRENT_TIMESTAMP
      WHERE id = ${invitationId} AND invited_user_id = ${currentUser.id}
        AND accepted_at IS NULL AND declined_at IS NULL AND revoked_at IS NULL
      RETURNING household_id, relationship`
      : sql`/* decideHouseholdInvitation:decline */
      UPDATE household_invitations SET declined_at = CURRENT_TIMESTAMP
      WHERE id = ${invitationId} AND invited_user_id = ${currentUser.id}
        AND accepted_at IS NULL AND declined_at IS NULL AND revoked_at IS NULL
      RETURNING household_id, relationship`
  const { rows: changed } = await write<{ household_id: string; relationship: string | null }>(
    update,
    options,
  )
  assert(changed[0], 409, 'Invitation is no longer pending')
  if (decision === 'decline') {
    await transaction.commit()
    return
  }
  const individual = await getOrCreateLockedInviteeIndividual(currentUser, options)
  await write(
    sql`/* decideHouseholdInvitation:insert-membership */
      INSERT INTO household_members (household_id, individual_id, relationship)
      VALUES (${changed[0].household_id}, ${individual.id}, ${changed[0].relationship})
      ON CONFLICT ON CONSTRAINT uniq_household_members__household_id_individual_id DO NOTHING`,
    options,
  )
  const membershipQuery = sql`/* decideHouseholdInvitation:membership */
    SELECT hm.id, hm.household_id, hm.relationship, `
  membershipQuery.append(membershipUpdatedAtSql('hm'))
  membershipQuery.append(sql` AS updated_at, `)
  membershipQuery.append(membershipIndividualSql('i', 'u'))
  membershipQuery.append(sql` AS individual
    FROM household_members hm
    JOIN individuals i ON i.id = hm.individual_id
    LEFT JOIN users u ON u.individual_id = i.id
    WHERE hm.household_id = ${changed[0].household_id}
      AND hm.individual_id = ${individual.id}`)
  const { rows: memberships } = await write<HouseholdMembershipRow>(membershipQuery, options)
  assert(memberships[0], 500, 'Household membership not found')
  await transaction.commit()
  return { membership: memberships[0] }
}
