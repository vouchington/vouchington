import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type TestHousehold = {
  id: string
  owner_user_id: string
  updated_at?: string
}

/** Inserts owned households for one owner. */
export async function insertTestHouseholdsForOwner(
  ownerId: string,
  count: number,
): Promise<TestHousehold[]> {
  const { rows } = await write<TestHousehold>(sql`/* insertTestHouseholdsForOwner */
    INSERT INTO households (owner_user_id, updated_at)
    SELECT ${ownerId}, CURRENT_TIMESTAMP - ordinal * INTERVAL '1 microsecond'
    FROM generate_series(1, ${count}) AS ordinal
    RETURNING id, owner_user_id
  `)
  if (rows.length !== count) {
    throw new Error(`Owner ${ownerId} inserted ${rows.length} households, wanted ${count}`)
  }
  return rows
}

/** Adds one individual to several households. */
export async function insertTestHouseholdMemberships(options: {
  householdIds: string[]
  individualId: string
}): Promise<void> {
  await write(sql`/* insertTestHouseholdMemberships */
    INSERT INTO household_members (household_id, individual_id)
    SELECT household_id, ${options.individualId}
    FROM unnest(${options.householdIds}::uuid[]) AS household_id
    ON CONFLICT ON CONSTRAINT uniq_household_members__household_id_individual_id DO NOTHING
  `)
}

/** Adds several individuals to one household. */
export async function insertTestHouseholdMembers(options: {
  householdId: string
  individualIds: string[]
}): Promise<void> {
  await write(sql`/* insertTestHouseholdMembers */
    INSERT INTO household_members (household_id, individual_id, updated_at)
    SELECT ${options.householdId}, members.individual_id,
      CURRENT_TIMESTAMP - members.ordinal * INTERVAL '1 microsecond'
    FROM unnest(${options.individualIds}::uuid[]) WITH ORDINALITY AS members(individual_id, ordinal)
    ON CONFLICT ON CONSTRAINT uniq_household_members__household_id_individual_id DO NOTHING
  `)
}

export async function insertTestHouseholdsAtPreciseTimestamps(
  ownerId: string,
  timestamps: string[],
): Promise<TestHousehold[]> {
  const { rows } = await write<TestHousehold>(sql`/* insertTestHouseholdsAtPreciseTimestamps */
    INSERT INTO households (owner_user_id, updated_at)
    SELECT ${ownerId}, stamp::timestamptz
    FROM unnest(${timestamps}::text[]) AS stamp
    RETURNING id, owner_user_id,
      to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
  `)
  if (rows.length !== timestamps.length) {
    throw new Error(
      `Owner ${ownerId} inserted ${rows.length} households, wanted ${timestamps.length}`,
    )
  }
  return rows
}
