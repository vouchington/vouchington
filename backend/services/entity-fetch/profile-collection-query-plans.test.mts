import assert from 'node:assert'
import { beforeAll, beforeEach, describe, it } from 'vitest'
import {
  analyzeCommunityMembershipsForTest,
  collectPlanNodes,
  createTestUserDirect,
  enableQueryCapture,
  explainCapturedTestQuery,
  insertTestCommunityMembershipsForUser,
  stopTestQueryCapture,
  type CapturedTestQuery,
} from '@voucha/test-helpers'
import { listUserMemberCommunities } from '@services/communities/members/member-communities'

let capturedQuery: CapturedTestQuery

const KEYSET_INDEX_PATTERN = /^idx_community_members__user_id_(?:desc|id)$/

describe('profile collection query plans', () => {
  beforeAll(async () => {
    const [owner, member, noiseMember] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    assert(owner && member && noiseMember)
    await Promise.all([
      insertTestCommunityMembershipsForUser(owner.id, member.id, 30),
      insertTestCommunityMembershipsForUser(owner.id, noiseMember.id, 10_000),
    ])
    await analyzeCommunityMembershipsForTest()
    enableQueryCapture()
    let queries: CapturedTestQuery[] = []
    try {
      await listUserMemberCommunities(member.id, member, { limit: 25 })
    } finally {
      queries = stopTestQueryCapture()
    }
    assert.equal(queries.length, 1)
    capturedQuery = queries[0]!
  })

  // Re-ANALYZE immediately before each EXPLAIN: concurrent inserts from parallel Vitest forks
  // between `beforeAll` and this test body can skew `community_members`/`communities` planner
  // stats enough to flip the join order and access path (see the two prior "stabilization"
  // attempts in #8196 and #8643). If this test flakes a fourth time, replace the shared dirty
  // database with an isolated fixture rather than tweaking ANALYZE timing again.
  beforeEach(async () => {
    await analyzeCommunityMembershipsForTest()
  })

  it.each(['force_custom_plan', 'force_generic_plan'] as const)(
    'uses the scoped membership keyset index in %s mode',
    async planCacheMode => {
      const plan = await explainCapturedTestQuery(
        'user-member-communities',
        capturedQuery,
        planCacheMode,
        analyzeCommunityMembershipsForTest,
      )
      const indexNames = membershipScanIndexNames(plan)
      assert.ok(
        indexNames.some(name => KEYSET_INDEX_PATTERN.test(name)),
        `cm scan indexes: ${JSON.stringify(indexNames)}\nplan: ${JSON.stringify(plan)}`,
      )
    },
    30_000,
  )
})

function membershipScanIndexNames(plan: unknown): string[] {
  return collectPlanNodes(plan)
    .filter(node => node['Relation Name'] === 'community_members' && node['Alias'] === 'cm')
    .map(node => node['Index Name'])
    .filter((name): name is string => typeof name === 'string')
}
