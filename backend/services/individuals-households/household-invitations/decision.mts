import assert from 'http-assert'
import sql from 'sql-template-strings'
import { beginTransaction, read, write } from '@data-stores/psql'
import { validateUUID } from '@modules/utils/ids'
import { assertNotSuspended } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import type { HouseholdMembershipRow } from '../types.mts'
import {
  membershipIndividualSql,
  membershipUpdatedAtSql,
} from '../households/household-membership-page-row.mts'
import { getOrCreateIndividual } from '../individuals/individuals.mts'

export async function decideHouseholdInvitation(
  currentUser: PrivateUser,
  invitationId: string,
  decision: 'accept' | 'decline',
): Promise<{ membership: HouseholdMembershipRow } | void> {
  assertNotSuspended(currentUser)
  validateUUID(invitationId)
  const { rows: visible } = await read<{ id: string }>(sql`/* decideHouseholdInvitation:visible */
    SELECT id FROM household_invitations
    WHERE id = ${invitationId} AND invited_user_id = ${currentUser.id}`)
  assert(visible[0], 404, 'Invitation not found')
  const individual = decision === 'accept' ? await getOrCreateIndividual(currentUser) : null
  await using transaction = await beginTransaction()
  const options = { query: transaction }
  const { rows: target } = await write<{ household_id: string }>(
    sql`/* decideHouseholdInvitation:household */
      SELECT household_id FROM household_invitations
      WHERE id = ${invitationId} AND invited_user_id = ${currentUser.id}`,
    options,
  )
  assert(target[0], 404, 'Invitation not found')
  await write(
    sql`/* decideHouseholdInvitation:lock-household */
    SELECT id FROM households WHERE id = ${target[0].household_id} FOR UPDATE`,
    options,
  )
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
  const membershipQuery = sql`/* decideHouseholdInvitation:membership */
    WITH inserted AS (
      INSERT INTO household_members (household_id, individual_id, relationship)
      VALUES (${changed[0].household_id}, ${individual!.id}, ${changed[0].relationship})
      ON CONFLICT ON CONSTRAINT uniq_household_members__household_id_individual_id
        DO UPDATE SET relationship = COALESCE(EXCLUDED.relationship, household_members.relationship)
      RETURNING id, household_id, individual_id, relationship, updated_at
    )
    SELECT inserted.id, inserted.household_id, inserted.relationship, `
  membershipQuery.append(membershipUpdatedAtSql('inserted'))
  membershipQuery.append(sql` AS updated_at, `)
  membershipQuery.append(membershipIndividualSql('i', 'u'))
  membershipQuery.append(sql` AS individual
    FROM inserted
    JOIN individuals i ON i.id = inserted.individual_id
    LEFT JOIN users u ON u.individual_id = i.id`)
  const { rows: memberships } = await write<HouseholdMembershipRow>(membershipQuery, options)
  await transaction.commit()
  return { membership: memberships[0] }
}
