import assert from 'http-assert'
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

/**
 * Admission fences are advisory locks, not row locks on the user or household parent.
 * See docs/development/postgresql/reference-transactions.md#lock-scope.
 * Accept takes the member-admission key in its own statement before FOR UPDATE on the household.
 * An EXISTS target list does not run the lock.
 * Keys hash canonical uuid text, so a mixed-case id shares the fence with the row's ::text form.
 */
export const householdMemberAdmissionLockPrefix = 'household-member-admission:'
export const householdIndividualAdmissionLockPrefix = 'household-individual-admission:'
export async function assertCanCreateHousehold(
  userId: string,
  options: QueryOptions,
): Promise<void> {
  const limits = getHouseholdLimits()
  await write(
    sql`/* assertCanCreateHousehold:lock */
      SELECT pg_advisory_xact_lock(hashtextextended('household-owner-admission:' || ${userId}::uuid::text, 0))`,
    options,
  )
  const { rows: people } = await write<{ individual_id: string | null }>(
    sql`/* assertCanCreateHousehold:individual */
      SELECT individual_id FROM users WHERE id = ${userId} LIMIT 1`,
    options,
  )
  const individualId = people[0]?.individual_id ?? null
  if (individualId) {
    await write(
      sql`/* assertCanCreateHousehold:lock-individual */
        SELECT pg_advisory_xact_lock(hashtextextended(${householdIndividualAdmissionLockPrefix} || ${individualId}::uuid::text, 0))`,
      options,
    )
  }
  const { rows } = await write<{ owned_count: number; individual_count: number }>(
    sql`/* assertCanCreateHousehold */
      SELECT
        (SELECT count(*)::int FROM (
          SELECT 1 FROM households WHERE owner_user_id = ${userId} LIMIT ${limits.householdsPerUser}
        ) owned) AS owned_count,
        (SELECT count(*)::int FROM (
          SELECT id FROM (
            SELECT h.id FROM households h WHERE h.owner_user_id = ${userId}
            UNION
            SELECT hm.household_id FROM household_members hm
            WHERE hm.individual_id = ${individualId}::uuid
          ) distinct_households
          LIMIT ${limits.householdsPerIndividual}
        ) capped) AS individual_count`,
    options,
  )
  const counts = rows[0]
  assert(counts, 500, 'Household admission was not counted')
  if (counts.owned_count >= limits.householdsPerUser) {
    throw createCodedError(409, 'Household limit reached', HOUSEHOLD_LIMIT_REACHED)
  }
  if (individualId && counts.individual_count >= limits.householdsPerIndividual) {
    throw createCodedError(
      409,
      'Individual household limit reached',
      INDIVIDUAL_HOUSEHOLD_LIMIT_REACHED,
    )
  }
}

export async function assertCanAddHouseholdMember(
  householdId: string,
  individualId: string,
  options: QueryOptions,
): Promise<void> {
  const limits = getHouseholdLimits()
  await write(
    sql`/* assertCanAddHouseholdMember:lock-household */
      SELECT pg_advisory_xact_lock(hashtextextended(${householdMemberAdmissionLockPrefix} || ${householdId}::uuid::text, 0))`,
    options,
  )
  await write(
    sql`/* assertCanAddHouseholdMember:lock-individual */
      SELECT pg_advisory_xact_lock(hashtextextended(${householdIndividualAdmissionLockPrefix} || ${individualId}::uuid::text, 0))`,
    options,
  )
  const distinctLimit = limits.householdsPerIndividual + 1
  const { rows } = await write<{
    existing: boolean
    member_count: number
    distinct_count: number
  }>(
    sql`/* assertCanAddHouseholdMember */
      SELECT
        EXISTS (
          SELECT 1 FROM household_members
          WHERE household_id = ${householdId} AND individual_id = ${individualId}
          LIMIT 1
        ) AS existing,
        (SELECT count(*)::int FROM (
          SELECT 1 FROM household_members
          WHERE household_id = ${householdId}
          LIMIT ${limits.membersPerHousehold}
        ) members) AS member_count,
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
  const admission = rows[0]
  assert(admission, 500, 'Household admission was not counted')
  if (admission.existing) return
  if (admission.member_count >= limits.membersPerHousehold) {
    throw createCodedError(409, 'Household member limit reached', HOUSEHOLD_MEMBER_LIMIT_REACHED)
  }
  if (admission.distinct_count >= distinctLimit) {
    throw createCodedError(
      409,
      'Individual household limit reached',
      INDIVIDUAL_HOUSEHOLD_LIMIT_REACHED,
    )
  }
}
