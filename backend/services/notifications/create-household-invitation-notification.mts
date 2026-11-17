import sql from 'sql-template-strings'
import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'

type HouseholdInvitationNotificationInput = {
  userId: string
  householdId: string
  invitationId: string
}

export async function createHouseholdInvitationNotifications(
  inputs: HouseholdInvitationNotificationInput[],
  options: QueryOptions,
): Promise<Array<{ userId: string; notificationId: string }>> {
  if (inputs.length === 0) return []
  const { rows } = await write<{ user_id: string; id: string }>(
    sql`/* createHouseholdInvitationNotifications */
      INSERT INTO notifications (user_id, entity_type, kind, household_id, household_invitation_id,
        event_key)
      SELECT user_id, 'household_invitation', 'household_invitation', household_id,
        household_invitation_id, event_key
      FROM UNNEST(
        ${inputs.map(input => input.userId)}::uuid[],
        ${inputs.map(input => input.householdId)}::uuid[],
        ${inputs.map(input => input.invitationId)}::uuid[],
        ${inputs.map(input => `household-invitation:${input.invitationId}`)}::text[]
      ) AS t(user_id, household_id, household_invitation_id, event_key)
      ORDER BY user_id ASC, event_key ASC
      ON CONFLICT (user_id, event_key) WHERE event_key IS NOT NULL DO NOTHING
      RETURNING user_id, id`,
    options,
  )
  return rows.map(row => ({ userId: row.user_id, notificationId: row.id }))
}
