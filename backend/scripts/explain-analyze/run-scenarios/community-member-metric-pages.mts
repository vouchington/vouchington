import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { invalidateCommunityMemberUserMetricsPage } from '@services/communities/members/invalidate-user-metrics'
import { communitiesWorkConfig } from '@services/communities/work-limits'
import { caches } from '@services/entity-cache/caches'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

const PAGE_SIZE = 500
const TARGET_ROWS = 604
const BACKGROUND_ROWS = 1_000
const CACHED_METRICS = { count: { communities_member: 1 } }

export async function runCommunityMemberMetricPages(): Promise<void> {
  const fixture = await seedMembershipPage()
  const cache = caches.user_metrics
  const restore = overrideDynamicConfigFieldsForTest(communitiesWorkConfig, {
    member_metric_invalidation_page_size: PAGE_SIZE,
  })
  try {
    await cache.setBatch(fixture.userIds.map(key => ({ key, value: CACHED_METRICS })))
    await write('/* analyzeCommunityMemberMetricPages */ ANALYZE community_members')
    await capturePages(fixture)
  } finally {
    restore()
    await cache.invalidateCacheGetByAny(...fixture.userIds)
    await using cleanup = await beginTransaction()
    await cleanup(sql`/* cleanupCommunityMemberMetricCommunities */
      DELETE FROM communities WHERE id = ANY(${fixture.communityIds}::uuid[])`)
    await cleanup(sql`/* cleanupCommunityMemberMetricUsers */
      DELETE FROM users WHERE id = ANY(${fixture.userIds}::uuid[])`)
    await cleanup.commit()
  }
}

async function capturePages(fixture: Awaited<ReturnType<typeof seedMembershipPage>>) {
  const scenario = 'community-member-metric-invalidation-at-cap'
  const queryName = 'readCommunityMemberMetricPage'
  const active = fixture.memberships
    .filter(row => !row.removed_at)
    .toSorted((a, b) => a.id.localeCompare(b.id))
  const eligible = active.slice(0, PAGE_SIZE + 1)
  assert.equal(active.length, PAGE_SIZE + 4)
  const data = {
    generation: randomUUID(),
    communityId: fixture.communityIds[0]!,
    upperBoundMembershipId: eligible.at(-1)!.id,
  }
  registerScenarioContract(scenario, {
    expectations: [
      // The generic plan uses the full community index and filters the fixture's removed rows.
      { kind: 'maxProcessedRows', relation: 'community_members', max: 599, captureIndex: 0 },
      { kind: 'maxProcessedRows', relation: 'community_members', max: 2, captureIndex: 1 },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      const first = await invalidateCommunityMemberUserMetricsPage(data)
      assert.equal(first.invalidated, PAGE_SIZE)
      assert.deepEqual(first.nextPageData, {
        ...data,
        afterMembershipId: eligible[PAGE_SIZE - 1]!.id,
      })
      await assertCache(fixture.userIds, eligible.slice(0, PAGE_SIZE))
      const last = await invalidateCommunityMemberUserMetricsPage(first.nextPageData!)
      assert.deepEqual(last, { invalidated: 1, nextPageData: null })
      await assertCache(fixture.userIds, eligible)
    },
    undefined,
    queryName,
  )
}

async function assertCache(userIds: string[], invalidated: { user_id: string }[]) {
  const invalidatedKeys = new Set(invalidated.map(row => row.user_id))
  assert.deepEqual(
    await caches.user_metrics.getBatch(userIds),
    userIds.map(id => (invalidatedKeys.has(id) ? null : CACHED_METRICS)),
  )
}

async function seedMembershipPage() {
  await using query = await beginTransaction()
  const slug = `metric-page-${randomUUID()}`
  const { rows: communities } = await query<{ id: string; slug: string }>(sql`
    /* seedCommunityMemberMetricCommunities */
    INSERT INTO communities (name, slug, created_by_id, created_via)
    SELECT 'EXPLAIN metric invalidation', ${slug} || '-' || n, ${seedUser.id}, 'system'
    FROM generate_series(1, 2) n
    RETURNING id, slug`)
  const communityIds = communities
    .toSorted((a, b) => a.slug.localeCompare(b.slug))
    .map(row => row.id)
  const { rows: users } = await query<{ id: string }>(sql`
    /* seedCommunityMemberMetricUsers */
    INSERT INTO users (username)
    SELECT ${slug} || '-' || n FROM generate_series(1, ${TARGET_ROWS + BACKGROUND_ROWS}) n
    RETURNING id`)
  const userIds = users.map(row => row.id)
  const { rows: members } = await query<{
    id: string
    user_id: string
    community_id: string
    removed_at: Date | null
  }>(sql`
    /* seedCommunityMemberMetricMemberships */
    WITH anchor AS (SELECT left(uuidv7()::text, 30) AS prefix)
    INSERT INTO community_members (id, community_id, user_id, removed_at)
    SELECT (anchor.prefix || lpad(to_hex(n), 6, '0'))::uuid,
      CASE WHEN n <= ${TARGET_ROWS} THEN ${communityIds[0]}::uuid ELSE ${communityIds[1]}::uuid END,
      user_id, CASE WHEN n % 6 = 0 THEN CURRENT_TIMESTAMP END
    FROM unnest(${userIds}::uuid[]) WITH ORDINALITY AS source(user_id, n)
    CROSS JOIN anchor
    RETURNING id, user_id, community_id, removed_at`)
  await query.commit()
  return {
    communityIds,
    userIds,
    memberships: members.filter(row => row.community_id === communityIds[0]),
  }
}
