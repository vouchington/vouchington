import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { definePlanStatisticsRefresh, type PlanStatisticsRefresh } from '../query-plans.mts'

type TestHousehold = {
  id: string
  owner_id: string
  updated_at?: string
}

type TestHouseholdMembership = {
  id: string
  household_id: string
}

type DeletedTestHousehold = Pick<TestHousehold, 'id'>

export async function deleteOwnedHouseholdsForTestUser(userId: string): Promise<number> {
  const { rows } = await write<DeletedTestHousehold>(sql`/* deleteOwnedHouseholdsForTestUser */
    DELETE FROM households
    WHERE owner_id = ${userId}
    RETURNING id
  `)
  return rows.length
}

export async function deleteTestHouseholdsForOwners(ownerIds: string[]): Promise<void> {
  await write(sql`/* deleteTestHouseholdsForOwners */
    DELETE FROM households
    WHERE owner_id = ANY(${ownerIds}::uuid[])
  `)
}

export async function insertTestHousehold(
  ownerId: string,
  updatedAt = new Date(),
): Promise<TestHousehold> {
  const { rows } = await write<TestHousehold>(sql`/* insertTestHousehold */
    INSERT INTO households (owner_id, updated_at)
    VALUES (${ownerId}, ${updatedAt})
    RETURNING id, owner_id
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
    INSERT INTO household_members (household_id, individual_id, relationship, updated_at)
    VALUES (${householdId}, ${individualId}, ${relationship}, ${updatedAt})
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

export async function insertTestHouseholdsForOwner(
  ownerId: string,
  count: number,
): Promise<TestHousehold[]> {
  const { rows } = await write<TestHousehold>(sql`/* insertTestHouseholdsForOwner */
    INSERT INTO households (owner_id, updated_at)
    SELECT ${ownerId}, CURRENT_TIMESTAMP - ordinal * INTERVAL '1 microsecond'
    FROM generate_series(1, ${count}) ordinal
    RETURNING id, owner_id
  `)
  return rows
}

export async function insertTestHouseholdMemberships(options: {
  householdIds: string[]
  individualId: string
}): Promise<void> {
  await write(sql`/* insertTestHouseholdMemberships */
    INSERT INTO household_members (household_id, individual_id)
    SELECT household_id, ${options.individualId}
    FROM unnest(${options.householdIds}::uuid[]) household_id
    ON CONFLICT ON CONSTRAINT uniq_household_members__household_id_individual_id DO NOTHING
  `)
}

export async function insertTestHouseholdMembers(options: {
  householdId: string
  individualIds: string[]
}): Promise<void> {
  await write(sql`/* insertTestHouseholdMembers */
    INSERT INTO household_members (household_id, individual_id, updated_at)
    SELECT ${options.householdId}, individual_id,
      CURRENT_TIMESTAMP - ordinal * INTERVAL '1 microsecond'
    FROM unnest(${options.individualIds}::uuid[]) WITH ORDINALITY members(individual_id, ordinal)
    ON CONFLICT ON CONSTRAINT uniq_household_members__household_id_individual_id DO NOTHING
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

export async function insertTestHouseholdsAtPreciseTimestamps(
  ownerId: string,
  timestamps: string[],
): Promise<TestHousehold[]> {
  const { rows } = await write<TestHousehold>(sql`/* insertTestHouseholdsAtPreciseTimestamps */
    INSERT INTO households (owner_id, updated_at)
    SELECT ${ownerId}, timestamp::timestamptz
    FROM unnest(${timestamps}::text[]) timestamp
    RETURNING id, owner_id,
      to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
  `)
  return rows
}
