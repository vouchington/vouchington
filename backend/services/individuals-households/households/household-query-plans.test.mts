import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import assert from 'node:assert'
import {
  analyzeHouseholdTablesForTest,
  createTestUserDirect,
  createTestUsersDirect,
  deleteTestHouseholdsForOwners,
  enableQueryCapture,
  explainCapturedTestQuery,
  insertTestHousehold,
  insertTestHouseholdMembers,
  insertTestHouseholdMemberships,
  insertTestHouseholdsForOwner,
  planIndexNames,
  stopTestQueryCapture,
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
    const owned = await insertTestHouseholdsForOwner(user.id, 30)
    const shared = await insertTestHouseholdsForOwner(otherOwner.id, 30)
    await insertTestHouseholdMemberships({
      householdIds: shared.map(household => household.id),
      individualId: user.individual_id!,
    })
    const membershipHousehold = await insertTestHousehold(otherOwner.id)
    const members = await createTestUsersDirect(30)
    fixtureOwnerIds.push(...members.map(member => member.id))
    await insertTestHouseholdMembers({
      householdId: membershipHousehold.id,
      individualIds: members.map(member => member.individual_id!),
    })
    const noiseOwner = await createTestUserDirect()
    fixtureOwnerIds.push(noiseOwner.id)
    const noiseMember = await createTestUserDirect()
    fixtureOwnerIds.push(noiseMember.id)
    const noiseHouseholds = await insertTestHouseholdsForOwner(noiseOwner.id, 1_000)
    await insertTestHouseholdMemberships({
      householdIds: noiseHouseholds.map(household => household.id),
      individualId: noiseMember.individual_id!,
    })
    await analyzeHouseholdTablesForTest()
    capturedQueries = {
      owned: await captureQuery(() => getHouseholdsByUser(user, { access: 'owned', limit: 25 })),
      member: await captureQuery(() => getHouseholdsByUser(user, { access: 'member', limit: 25 })),
      all: await captureQuery(() => getHouseholdsByUser(user, { access: 'all', limit: 25 })),
      memberships: await captureQuery(() =>
        getHouseholdMemberships(otherOwner, membershipHousehold.id, { limit: 25 }),
      ),
    }
    assert.equal(owned.length, 30)
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

      expect(planIndexNames(byName.owned)).toContain('idx_households__owner_updated_id')
      expect(planIndexNames(byName.member)).toContain('idx_household_members__individual_household')
      expect(planIndexNames(byName.all)).toEqual(
        expect.arrayContaining([
          'idx_households__owner_updated_id',
          'idx_household_members__individual_household',
        ]),
      )
      expect(planIndexNames(byName.memberships)).toContain(
        'idx_household_members__household_updated_id',
      )
    },
    30_000,
  )
})

async function captureQuery(run: () => Promise<unknown>): Promise<CapturedTestQuery> {
  enableQueryCapture()
  let queries: CapturedTestQuery[] = []
  try {
    await run()
  } finally {
    queries = stopTestQueryCapture()
  }
  assert.equal(queries.length, 1)
  return queries[0]!
}
