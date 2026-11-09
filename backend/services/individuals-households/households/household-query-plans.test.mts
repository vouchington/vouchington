import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import assert from 'node:assert'
import {
  analyzeHouseholdTablesForTest,
  captureScopedTestQueries,
  createTestUserDirect,
  createTestUsersDirect,
  deleteTestHouseholdsForOwners,
  explainCapturedTestQuery,
  insertTestHousehold,
  insertTestHouseholdMembers,
  insertTestHouseholdMemberships,
  insertTestHouseholdsForOwner,
  planIndexNames,
  type CapturedTestQuery,
} from '@voucha/test-helpers'
import { getHouseholdMemberships, getHouseholdsByUser } from './household-lists.mts'

let capturedQueries: Record<'owned' | 'member' | 'all' | 'memberships', CapturedTestQuery>
let fixtureOwnerIds: string[] = []

describe('household pagination query plans', () => {
  beforeAll(async () => {
    fixtureOwnerIds = []
    const user = await createTestUserDirect()
    fixtureOwnerIds.push(user.id)
    const otherOwner = await createTestUserDirect()
    fixtureOwnerIds.push(otherOwner.id)
    // Contract caps keep one owner at 2 households, one household at 25 members and one
    // individual at 5 households, so table-scale noise comes from many owners instead.
    await insertTestHouseholdsForOwner(user.id, 1)
    const sharedOwners = await createTestUsersDirect(4)
    fixtureOwnerIds.push(...sharedOwners.map(owner => owner.id))
    const shared = await Promise.all(sharedOwners.map(owner => insertTestHousehold(owner.id)))
    await insertTestHouseholdMemberships({
      householdIds: shared.map(household => household.id),
      individualId: user.individual_id!,
    })
    const membershipHousehold = await insertTestHousehold(otherOwner.id)
    const members = await createTestUsersDirect(24)
    fixtureOwnerIds.push(...members.map(member => member.id))
    await insertTestHouseholdMembers({
      householdId: membershipHousehold.id,
      individualIds: members.map(member => member.individual_id!),
    })
    const noiseOwners = await createTestUsersDirect(500)
    fixtureOwnerIds.push(...noiseOwners.map(noise => noise.id))
    await analyzeHouseholdTablesForTest()
    capturedQueries = {
      owned: await captureQuery(() => getHouseholdsByUser(user, { access: 'owned', limit: 25 })),
      member: await captureQuery(() => getHouseholdsByUser(user, { access: 'member', limit: 25 })),
      all: await captureQuery(() => getHouseholdsByUser(user, { access: 'all', limit: 25 })),
      memberships: await captureQuery(() =>
        getHouseholdMemberships(otherOwner, membershipHousehold.id, { limit: 25 }),
      ),
    }
  })

  // Re-ANALYZE immediately before each EXPLAIN: concurrent inserts from parallel Vitest forks
  // between `beforeAll` and this test body can skew planner stats enough to flip the join order
  // and access path (see #9042's community_members/communities stabilization). Standing
  // escalation: if this test flakes in CI, migrate it into the isolated `explain-analyze`
  // scenario suite rather than tweaking ANALYZE timing.
  beforeEach(async () => {
    await analyzeHouseholdTablesForTest()
  })

  afterAll(async () => {
    await deleteTestHouseholdsForOwners(fixtureOwnerIds)
  })

  it.each(['force_custom_plan', 'force_generic_plan'] as const)(
    'uses bounded access paths in %s mode',
    async planCacheMode => {
      const plans = await Promise.all(
        Object.entries(capturedQueries).map(async ([name, captured]) => [
          name,
          await explainCapturedTestQuery(
            name,
            captured,
            planCacheMode,
            analyzeHouseholdTablesForTest,
          ),
        ]),
      )
      const byName = Object.fromEntries(plans)

      expect(planIndexNames(byName.owned)).toContain('uniq_households__owner_user_id_owner_slot')
      expect(planIndexNames(byName.member)).toContain('idx_household_members__individual_household')
      expect(planIndexNames(byName.all)).toEqual(
        expect.arrayContaining([
          'uniq_households__owner_user_id_owner_slot',
          'idx_household_members__individual_household',
        ]),
      )
      expect(planIndexNames(byName.memberships)).toContain(
        'idx_household_members__household_updated_id',
      )
    },
  )
})

async function captureQuery(run: () => Promise<unknown>): Promise<CapturedTestQuery> {
  const queries = await captureScopedTestQueries(run)
  assert.equal(
    queries.length,
    1,
    `expected one household query, captured ${queries.length}: ${queries
      .map(query => query.text.split('\n', 1)[0])
      .join(' || ')}`,
  )
  return queries[0]!
}
