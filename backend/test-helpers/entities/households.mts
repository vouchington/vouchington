import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { definePlanStatisticsRefresh, type PlanStatisticsRefresh } from '../query-plans.mts'

type TestHousehold = {
  id: string
  owner_user_id: string
  updated_at?: string
}

type TestHouseholdMembership = {
  id: string
  household_id: string
}

type DeletedTestHousehold = Pick<TestHousehold, 'id'>

export async function countHouseholdInvitationNotificationsForTest(
  userId: string,
  invitationId: string,
): Promise<number> {
  return (await listHouseholdInvitationNotificationIdsForTest(userId, invitationId)).length
}

export async function listHouseholdInvitationNotificationIdsForTest(
  userId: string,
  invitationId: string,
): Promise<string[]> {
  const { rows } = await read<{
    id: string
  }>(sql`/* listHouseholdInvitationNotificationIdsForTest */
    SELECT id FROM notifications WHERE user_id = ${userId}
      AND household_invitation_id = ${invitationId}`)
  return rows.map(row => row.id)
}

export async function insertTestHouseholdInvitation(input: {
  householdId: string
  invitedUserId: string
  invitedById: string
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* insertTestHouseholdInvitation */
    INSERT INTO household_invitations (household_id, invited_user_id, invited_by_id)
    VALUES (${input.householdId}, ${input.invitedUserId}, ${input.invitedById})
    RETURNING id`)
  return rows[0]!.id
}

export async function setTestHouseholdInvitationTerminalState(
  invitationId: string,
  state: 'accepted' | 'declined' | 'revoked',
): Promise<number> {
  const { rowCount } = await write(sql`/* setTestHouseholdInvitationTerminalState */
    UPDATE household_invitations
    SET accepted_at = CASE WHEN ${state} = 'accepted' THEN CURRENT_TIMESTAMP ELSE NULL END,
      declined_at = CASE WHEN ${state} = 'declined' THEN CURRENT_TIMESTAMP ELSE NULL END,
      revoked_at = CASE WHEN ${state} = 'revoked' THEN CURRENT_TIMESTAMP ELSE NULL END
    WHERE id = ${invitationId}`)
  return rowCount ?? 0
}

export async function unlinkTestUserIndividualForInvitationFallback(userId: string): Promise<void> {
  await write(sql`/* unlinkTestUserIndividualForInvitationFallback */
    UPDATE users SET individual_id = NULL WHERE id = ${userId}`)
}

export async function deleteOwnedHouseholdsForTestUser(userId: string): Promise<number> {
  const { rows } = await write<DeletedTestHousehold>(sql`/* deleteOwnedHouseholdsForTestUser */
    DELETE FROM households
    WHERE owner_user_id = ${userId}
    RETURNING id
  `)
  return rows.length
}

export async function countOwnedHouseholdsForTestUser(userId: string): Promise<number> {
  const { rows } = await write<{ count: number }>(sql`/* countOwnedHouseholdsForTestUser */
    SELECT count(*)::int AS count FROM households WHERE owner_user_id = ${userId}
  `)
  return rows[0]!.count
}

export async function deleteTestHouseholdById(householdId: string): Promise<void> {
  await write(sql`/* deleteTestHouseholdById */
    DELETE FROM households WHERE id = ${householdId}
  `)
}

export async function deleteTestHouseholdsForOwners(ownerIds: string[]): Promise<void> {
  await write(sql`/* deleteTestHouseholdsForOwners */
    DELETE FROM households
    WHERE owner_user_id = ANY(${ownerIds}::uuid[])
  `)
}

export async function insertTestHousehold(
  ownerId: string,
  updatedAt = new Date(),
): Promise<TestHousehold> {
  const { rows } = await write<TestHousehold>(sql`/* insertTestHousehold */
    INSERT INTO households (owner_user_id, owner_slot, updated_at)
    VALUES (${ownerId}, (
      SELECT slot FROM generate_series(1, 2) slot
      WHERE NOT EXISTS (SELECT 1 FROM households WHERE owner_user_id = ${ownerId} AND owner_slot = slot)
      ORDER BY slot LIMIT 1
    ), ${updatedAt})
    RETURNING id, owner_user_id
  `)
  return rows[0]!
}

export async function insertTestHouseholdMembership(options: {
  householdId: string
  individualId: string
  relationship?: string | null
  updatedAt?: Date
}): Promise<TestHouseholdMembership> {
  const { householdId, individualId, relationship = null, updatedAt = new Date() } = options
  const { rows } = await write<TestHouseholdMembership>(sql`/* insertTestHouseholdMembership */
    INSERT INTO household_members
      (household_id, individual_id, member_slot, individual_slot, relationship, updated_at)
    VALUES (${householdId}, ${individualId}, (
      SELECT slot FROM generate_series(1, 25) slot
      WHERE NOT EXISTS (
        SELECT 1 FROM household_members WHERE household_id = ${householdId} AND member_slot = slot
      )
      ORDER BY slot LIMIT 1
    ), (
      SELECT slot FROM generate_series(1, 5) slot
      WHERE NOT EXISTS (
        SELECT 1 FROM household_members WHERE individual_id = ${individualId} AND individual_slot = slot
      )
      ORDER BY slot LIMIT 1
    ), ${relationship}, ${updatedAt})
    RETURNING id, household_id
  `)
  return rows[0]!
}

export async function deleteTestHouseholdMembership(membershipId: string): Promise<void> {
  await write(sql`/* deleteTestHouseholdMembership */
    DELETE FROM household_members
    WHERE id = ${membershipId}
  `)
}

// households, household_members are this test's own fixtures; individuals, users are also joined
// by getHouseholdMemberships (household-lists.mts) but are seeded broadly by dev-seed, so this
// covers every relation in the plan rather than just the driving table (see #9042: an uncovered
// join partner drifted planner stats enough to flip join order).
export const analyzeHouseholdTablesForTest: PlanStatisticsRefresh = definePlanStatisticsRefresh(
  async () => {
    await write(
      sql`/* analyzeHouseholdTablesForTest */ ANALYZE households, household_members, individuals, users`,
    )
  },
)
