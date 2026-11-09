import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type TestHousehold = {
  id: string
  owner_user_id: string
  updated_at?: string
}

// Bulk fixtures fill the bounded slots (owners 1-2, households 1-25) that the schema enforces.

/** Inserts owned households into the owner's free slots; the schema caps owners at 2. */
export async function insertTestHouseholdsForOwner(
  ownerId: string,
  count: number,
): Promise<TestHousehold[]> {
  const { rows } = await write<TestHousehold>(sql`/* insertTestHouseholdsForOwner */
    WITH free AS (
      SELECT slot, row_number() OVER (ORDER BY slot) AS ordinal
      FROM generate_series(1, 2) slot
      WHERE NOT EXISTS (
        SELECT 1 FROM households WHERE owner_user_id = ${ownerId} AND owner_slot = slot
      )
    )
    INSERT INTO households (owner_user_id, owner_slot, updated_at)
    SELECT ${ownerId}, slot, CURRENT_TIMESTAMP - ordinal * INTERVAL '1 microsecond'
    FROM free
    WHERE ordinal <= ${count}
    RETURNING id, owner_user_id
  `)
  if (rows.length !== count) {
    throw new Error(`Owner ${ownerId} has ${rows.length} free household slots, wanted ${count}`)
  }
  return rows
}

/** Adds one individual to several households; the schema caps an individual at 5. */
export async function insertTestHouseholdMemberships(options: {
  householdIds: string[]
  individualId: string
}): Promise<void> {
  await write(sql`/* insertTestHouseholdMemberships */
    WITH free AS (
      SELECT slot, row_number() OVER (ORDER BY slot) AS ordinal
      FROM generate_series(1, 5) slot
      WHERE NOT EXISTS (
        SELECT 1 FROM household_members
        WHERE individual_id = ${options.individualId} AND individual_slot = slot
      )
    )
    INSERT INTO household_members (household_id, individual_id, member_slot, individual_slot)
    SELECT households.household_id, ${options.individualId}, (
      SELECT slot FROM generate_series(1, 25) slot
      WHERE NOT EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.household_id = households.household_id AND hm.member_slot = slot
      )
      ORDER BY slot LIMIT 1
    ), free.slot
    FROM unnest(${options.householdIds}::uuid[]) WITH ORDINALITY households(household_id, ordinal)
    JOIN free ON free.ordinal = households.ordinal
    ON CONFLICT ON CONSTRAINT uniq_household_members__household_id_individual_id DO NOTHING
  `)
}

/** Adds several individuals to one household; each takes its own lowest free individual slot. */
export async function insertTestHouseholdMembers(options: {
  householdId: string
  individualIds: string[]
}): Promise<void> {
  await write(sql`/* insertTestHouseholdMembers */
    WITH free AS (
      SELECT slot, row_number() OVER (ORDER BY slot) AS ordinal
      FROM generate_series(1, 25) slot
      WHERE NOT EXISTS (
        SELECT 1 FROM household_members WHERE household_id = ${options.householdId} AND member_slot = slot
      )
    )
    INSERT INTO household_members
      (household_id, individual_id, member_slot, individual_slot, updated_at)
    SELECT ${options.householdId}, members.individual_id, free.slot, (
      SELECT slot FROM generate_series(1, 5) slot
      WHERE NOT EXISTS (
        SELECT 1 FROM household_members hm
        WHERE hm.individual_id = members.individual_id AND hm.individual_slot = slot
      )
      ORDER BY slot LIMIT 1
    ), CURRENT_TIMESTAMP - members.ordinal * INTERVAL '1 microsecond'
    FROM unnest(${options.individualIds}::uuid[]) WITH ORDINALITY members(individual_id, ordinal)
    JOIN free ON free.ordinal = members.ordinal
    ON CONFLICT ON CONSTRAINT uniq_household_members__household_id_individual_id DO NOTHING
  `)
}

export async function insertTestHouseholdsAtPreciseTimestamps(
  ownerId: string,
  timestamps: string[],
): Promise<TestHousehold[]> {
  const { rows } = await write<TestHousehold>(sql`/* insertTestHouseholdsAtPreciseTimestamps */
    WITH free AS (
      SELECT slot, row_number() OVER (ORDER BY slot) AS ordinal
      FROM generate_series(1, 2) slot
      WHERE NOT EXISTS (
        SELECT 1 FROM households WHERE owner_user_id = ${ownerId} AND owner_slot = slot
      )
    )
    INSERT INTO households (owner_user_id, owner_slot, updated_at)
    SELECT ${ownerId}, free.slot, stamps.timestamp::timestamptz
    FROM unnest(${timestamps}::text[]) WITH ORDINALITY stamps(timestamp, ordinal)
    JOIN free ON free.ordinal = stamps.ordinal
    RETURNING id, owner_user_id,
      to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
  `)
  if (rows.length !== timestamps.length) {
    throw new Error(`Owner ${ownerId} has too few free household slots for ${timestamps.length}`)
  }
  return rows
}
