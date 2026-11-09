/* oxlint-disable no-await-in-loop -- bounded slot retries; each reread follows a lost race */
import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import {
  HOUSEHOLD_LIMIT_REACHED,
  HOUSEHOLD_MEMBER_LIMIT_REACHED,
  INDIVIDUAL_HOUSEHOLD_LIMIT_REACHED,
} from '@modules/on-error/error-codes'
import { createCodedError } from '@vouchington/sentry'
import sql from 'sql-template-strings'
import { getHouseholdLimits, householdLimitsMaxValues } from './household-limits-config.mts'
import type { HouseholdRow } from './types.mts'

/**
 * Owned-household and member caps are database guarantees on the written row: each row takes a
 * bounded slot, and `UNIQUE (owner_user_id, owner_slot)` / `UNIQUE (household_id, member_slot)`
 * with a CHECK at the config hard maximum reject an over-cap insert. No advisory or parent locks.
 * The CHECK bound is the hard maximum; the configured value is enforced by the insert's count guard.
 * See docs/development/postgresql/reference-transactions.md#lock-scope.
 * `ON CONFLICT DO NOTHING` keeps a lost slot race from aborting the caller's transaction; the loser
 * rereads and retries, bounded by the hard maximum.
 */
async function countCapped(
  sqlText: ReturnType<typeof sql>,
  options: QueryOptions,
): Promise<number> {
  const { rows } = await write<{ count: number }>(sqlText, options)
  return rows[0]?.count ?? 0
}

/** Insert an owned household in the lowest free slot, or refuse with the existing cap error. */
export async function insertOwnedHousehold(
  userId: string,
  options: QueryOptions,
): Promise<HouseholdRow> {
  const { householdsPerUser } = getHouseholdLimits()
  const attempts = householdLimitsMaxValues.max_households_per_user + 1
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    // no-mistakes-disable-next-line query-reached-per-item: each retry follows a lost slot race and must reread.
    const { rows } = await write<HouseholdRow>( // oxlint-disable-line no-await-in-loop -- each retry follows a lost slot race and must reread.
      sql`/* insertOwnedHousehold */
        INSERT INTO households (owner_user_id, owner_slot)
        SELECT ${userId}::uuid, slot
        FROM generate_series(1, ${householdLimitsMaxValues.max_households_per_user}) AS slot
        WHERE NOT EXISTS (
          SELECT 1 FROM households WHERE owner_user_id = ${userId} AND owner_slot = slot
        )
          AND (
            SELECT count(*) FROM (
              SELECT 1 FROM households WHERE owner_user_id = ${userId} LIMIT ${householdsPerUser}
            ) owned
          ) < ${householdsPerUser}
        ORDER BY slot
        LIMIT 1
        ON CONFLICT DO NOTHING
        RETURNING id, owner_user_id, updated_at`,
      options,
    )
    if (rows[0]) return rows[0]
    // no-mistakes-disable-next-line query-reached-per-item: a zero-row insert is full or a lost race; reread to tell.
    const owned = await countCapped(
      sql`/* insertOwnedHousehold:count */
        SELECT count(*)::int AS count FROM (
          SELECT 1 FROM households WHERE owner_user_id = ${userId} LIMIT ${householdsPerUser}
        ) owned`,
      options,
    )
    if (owned >= householdsPerUser) break
  }
  throw createCodedError(409, 'Household limit reached', HOUSEHOLD_LIMIT_REACHED)
}

/** Refuse when the user's individual already belongs to the per-individual household cap. */
export async function assertIndividualHouseholdRoom(
  userId: string,
  options: QueryOptions,
): Promise<void> {
  const { householdsPerIndividual } = getHouseholdLimits()
  const count = await countCapped(
    sql`/* assertIndividualHouseholdRoom */
      SELECT count(*)::int AS count FROM (
        SELECT id FROM (
          SELECT h.id FROM households h WHERE h.owner_user_id = ${userId}
          UNION
          SELECT hm.household_id
          FROM users u
          JOIN household_members hm ON hm.individual_id = u.individual_id
          WHERE u.id = ${userId}
        ) distinct_households
        LIMIT ${householdsPerIndividual + 1}
      ) capped`,
    options,
  )
  if (count > householdsPerIndividual) {
    throw createCodedError(
      409,
      'Individual household limit reached',
      INDIVIDUAL_HOUSEHOLD_LIMIT_REACHED,
    )
  }
}

export type HouseholdMemberInsert = {
  householdId: string
  individualId: string
  relationship: string | null
}

/**
 * Add a membership in the lowest free slot. Returns false when the individual is already a member
 * (the caller decides whether to update it); throws the existing cap errors otherwise.
 */
export async function insertHouseholdMember(
  input: HouseholdMemberInsert,
  options: QueryOptions,
): Promise<boolean> {
  const { householdId, individualId, relationship } = input
  const { membersPerHousehold, householdsPerIndividual } = getHouseholdLimits()
  const distinctLimit = householdsPerIndividual + 1
  const { rows: existing } = await write<{ existing: boolean; distinct_count: number }>(
    sql`/* insertHouseholdMember:existing */
      SELECT
        EXISTS (
          SELECT 1 FROM household_members
          WHERE household_id = ${householdId} AND individual_id = ${individualId}
        ) AS existing,
        (SELECT count(*)::int FROM (
          SELECT id FROM (
            SELECT h.id
            FROM users u
            JOIN households h ON h.owner_user_id = u.id
            WHERE u.individual_id = ${individualId}
            UNION
            SELECT hm.household_id FROM household_members hm
            WHERE hm.individual_id = ${individualId}
            UNION
            SELECT ${householdId}::uuid
          ) distinct_households
          LIMIT ${distinctLimit}
        ) capped) AS distinct_count`,
    options,
  )
  if (existing[0]?.existing) return false
  if ((existing[0]?.distinct_count ?? 0) >= distinctLimit) {
    throw createCodedError(
      409,
      'Individual household limit reached',
      INDIVIDUAL_HOUSEHOLD_LIMIT_REACHED,
    )
  }
  const attempts = householdLimitsMaxValues.max_members_per_household + 1
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    // no-mistakes-disable-next-line query-reached-per-item: each retry follows a lost slot race and must reread.
    const { rowCount } = await write(
      sql`/* insertHouseholdMember */
        INSERT INTO household_members (household_id, individual_id, relationship, member_slot)
        SELECT ${householdId}::uuid, ${individualId}::uuid, ${relationship}::text, slot
        FROM generate_series(1, ${householdLimitsMaxValues.max_members_per_household}) AS slot
        WHERE NOT EXISTS (
          SELECT 1 FROM household_members WHERE household_id = ${householdId} AND member_slot = slot
        )
          AND (
            SELECT count(*) FROM (
              SELECT 1 FROM household_members
              WHERE household_id = ${householdId} LIMIT ${membersPerHousehold}
            ) members
          ) < ${membersPerHousehold}
        ORDER BY slot
        LIMIT 1
        ON CONFLICT DO NOTHING`,
      options,
    )
    if (rowCount) return true
    // no-mistakes-disable-next-line query-reached-per-item: a zero-row insert is full, a duplicate, or a lost race.
    const { rows } = await write<{ existing: boolean; member_count: number }>( // oxlint-disable-line no-await-in-loop -- a zero-row insert is full, a duplicate, or a lost race.
      sql`/* insertHouseholdMember:count */
        SELECT
          EXISTS (
            SELECT 1 FROM household_members
            WHERE household_id = ${householdId} AND individual_id = ${individualId}
          ) AS existing,
          (SELECT count(*)::int FROM (
            SELECT 1 FROM household_members
            WHERE household_id = ${householdId} LIMIT ${membersPerHousehold}
          ) members) AS member_count`,
      options,
    )
    if (rows[0]?.existing) return false
    if ((rows[0]?.member_count ?? 0) >= membersPerHousehold) break
  }
  throw createCodedError(409, 'Household member limit reached', HOUSEHOLD_MEMBER_LIMIT_REACHED)
}
