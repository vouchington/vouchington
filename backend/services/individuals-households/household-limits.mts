import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import {
  HOUSEHOLD_LIMIT_REACHED,
  HOUSEHOLD_MEMBER_LIMIT_REACHED,
  INDIVIDUAL_HOUSEHOLD_LIMIT_REACHED,
} from '@modules/on-error/error-codes'
import { createCodedError } from '@vouchington/sentry'
import sql from 'sql-template-strings'
import { getHouseholdLimits } from './household-limits-config.mts'
import type { HouseholdRow } from './types.mts'

/**
 * Insert an owned household, or refuse when the capped count already sees the cap.
 * Owned-household and member caps are best effort. Count with `LIMIT cap + 1`, then write.
 * A real race may admit one more than the cap.
 * See docs/development/postgresql/reference-transactions.md#lock-scope.
 */
export async function insertOwnedHousehold(
  userId: string,
  options: QueryOptions,
): Promise<HouseholdRow> {
  const { householdsPerUser } = getHouseholdLimits()
  const { rows: ownedRows } = await write<{ count: number }>(
    sql`/* insertOwnedHousehold:count */
      SELECT count(*)::int AS count FROM (
        SELECT 1 FROM households WHERE owner_user_id = ${userId} LIMIT ${householdsPerUser + 1}
      ) owned`,
    options,
  )
  const owned = ownedRows[0]?.count ?? 0
  if (owned >= householdsPerUser) {
    throw createCodedError(409, 'Household limit reached', HOUSEHOLD_LIMIT_REACHED)
  }
  const { rows } = await write<HouseholdRow>(
    sql`/* insertOwnedHousehold */
      INSERT INTO households (owner_user_id)
      VALUES (${userId})
      RETURNING id, owner_user_id, updated_at`,
    options,
  )
  const household = rows[0]
  if (!household) throw createCodedError(409, 'Household limit reached', HOUSEHOLD_LIMIT_REACHED)
  return household
}

export type HouseholdMemberInsert = {
  householdId: string
  individualId: string
  relationship: string | null
}

/**
 * Add a membership. Returns false when the individual is already a member (the caller decides
 * whether to update it). Throws the cap errors when the capped count already sees that cap.
 * Every owned household also gives its owner a membership, so the individual count includes
 * owned and joined households.
 */
export async function insertHouseholdMember(
  input: HouseholdMemberInsert,
  options: QueryOptions,
): Promise<boolean> {
  const { householdId, individualId, relationship } = input
  const { membersPerHousehold, householdsPerIndividual } = getHouseholdLimits()
  const { rows } = await write<{ existing: boolean; member_count: number; joined_count: number }>(
    sql`/* insertHouseholdMember:count */
      SELECT
        EXISTS (
          SELECT 1 FROM household_members
          WHERE household_id = ${householdId} AND individual_id = ${individualId}
        ) AS existing,
        (SELECT count(*)::int FROM (
          SELECT 1 FROM household_members
          WHERE household_id = ${householdId} LIMIT ${membersPerHousehold + 1}
        ) members) AS member_count,
        (SELECT count(*)::int FROM (
          SELECT 1 FROM household_members
          WHERE individual_id = ${individualId} LIMIT ${householdsPerIndividual + 1}
        ) joined) AS joined_count`,
    options,
  )
  if (rows[0]?.existing) return false
  if ((rows[0]?.joined_count ?? 0) >= householdsPerIndividual) {
    throw createCodedError(
      409,
      'Individual household limit reached',
      INDIVIDUAL_HOUSEHOLD_LIMIT_REACHED,
    )
  }
  if ((rows[0]?.member_count ?? 0) >= membersPerHousehold) {
    throw createCodedError(409, 'Household member limit reached', HOUSEHOLD_MEMBER_LIMIT_REACHED)
  }
  const { rowCount } = await write(
    sql`/* insertHouseholdMember */
      INSERT INTO household_members (household_id, individual_id, relationship)
      VALUES (${householdId}::uuid, ${individualId}::uuid, ${relationship}::text)
      ON CONFLICT ON CONSTRAINT uniq_household_members__household_id_individual_id DO NOTHING`,
    options,
  )
  return Boolean(rowCount)
}
