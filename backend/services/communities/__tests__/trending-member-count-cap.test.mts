import { readFileSync } from 'node:fs'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
  overrideDynamicConfigFieldsForTest,
  removeTestCommunityMember,
} from '@voucha/test-helpers'
import { refreshMaterializedViewForTest } from '../../../test-helpers/refresh-materialized-view-for-test.mts'
import { describe, expect, it } from 'vitest'
import {
  syncTrendingCommunityMemberCountCap,
  TRENDING_COMMUNITY_MEMBER_COUNT_CAP_DEFAULT,
  TRENDING_COMMUNITY_MEMBER_COUNT_CAP_MAX,
  trendingCommunitiesConfig,
} from '../trending-member-count-cap.mts'

const MIGRATION_SQL = readFileSync(
  new URL(
    '../../../data-stores/psql/migrations/0758-00-00-trending-community-member-count-cap.sql',
    import.meta.url,
  ),
  'utf8',
)
const VIEW_SQL = readFileSync(
  new URL('../../../data-stores/psql/views/2026-11-07-trending-communities.sql', import.meta.url),
  'utf8',
)

describe('trending community member count cap', () => {
  it('keeps the SQL cap literals aligned with the dynamic-config bounds', () => {
    expect(MIGRATION_SQL).toContain(
      `CHECK (member_count_cap BETWEEN 1 AND ${TRENDING_COMMUNITY_MEMBER_COUNT_CAP_MAX})`,
    )
    expect(MIGRATION_SQL).toContain(`VALUES (TRUE, ${TRENDING_COMMUNITY_MEMBER_COUNT_CAP_DEFAULT})`)
    expect(VIEW_SQL).toContain(
      `COALESCE((SELECT stored.member_count_cap FROM trending_community_member_count_caps stored WHERE stored.is_singleton), ${TRENDING_COMMUNITY_MEMBER_COUNT_CAP_DEFAULT})`,
    )
  })

  it('counts members through the cap and leaves ineligible posts out of the score', async () => {
    const cap = 3
    await trendingCommunitiesConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(trendingCommunitiesConfig, {
      member_count_cap: cap,
    })
    const rand = createRandomString(8)
    const owner = await createTestUser()
    const [first, second, third] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const under = await insertTestCommunity({
      createdById: owner.id,
      slug: `trending-cap-under-${rand}`,
      visibility: 'public',
    })
    const over = await insertTestCommunity({
      createdById: owner.id,
      slug: `trending-cap-over-${rand}`,
      visibility: 'public',
    })
    const privateOnly = await insertTestCommunity({
      createdById: owner.id,
      slug: `trending-cap-private-${rand}`,
      visibility: 'public',
    })
    const unreviewed = await insertTestCommunity({
      createdById: owner.id,
      slug: `trending-cap-unreviewed-${rand}`,
      visibility: 'public',
    })
    try {
      await insertTestCommunityMember({ communityId: under.id, userId: owner.id, role: 'owner' })
      await insertTestCommunityMember({ communityId: under.id, userId: first.id })
      await insertTestCommunityMember({ communityId: under.id, userId: second.id })
      await removeTestCommunityMember(under.id, second.id)
      await reviewedPost(under.id, owner.id, `under-${rand}`)

      await insertTestCommunityMember({ communityId: over.id, userId: owner.id, role: 'owner' })
      await insertTestCommunityMember({ communityId: over.id, userId: first.id })
      await insertTestCommunityMember({ communityId: over.id, userId: second.id })
      await insertTestCommunityMember({ communityId: over.id, userId: third.id })
      await reviewedPost(over.id, owner.id, `over-${rand}`)

      await insertTestCommunityMember({
        communityId: privateOnly.id,
        userId: owner.id,
        role: 'owner',
      })
      const privatePostId = await insertTestPost({
        title: `Private ${rand}`,
        slug: `trending-cap-private-post-${rand}`,
        createdById: owner.id,
        markdown: 'A private post',
        communityId: privateOnly.id,
        privacy: 'private',
        broadcast: 'users',
      })
      await insertTestCommunityPostReview({
        communityId: privateOnly.id,
        postId: privatePostId,
        submittedById: owner.id,
      })

      await insertTestCommunityMember({
        communityId: unreviewed.id,
        userId: owner.id,
        role: 'owner',
      })
      await insertTestPost({
        title: `Unreviewed ${rand}`,
        slug: `trending-cap-unreviewed-post-${rand}`,
        createdById: owner.id,
        markdown: 'A post with no review',
        communityId: unreviewed.id,
        privacy: 'public',
        broadcast: 'everyone',
      })

      const rows = await refreshAndReadScores([under.id, over.id, privateOnly.id, unreviewed.id])
      const byId = new Map(rows.map(row => [row.id, row]))
      const underRow = byId.get(under.id)
      const overRow = byId.get(over.id)

      expect(underRow?.members_capped).toBe(false)
      expect(Number(underRow?.trending_score)).toBe(3)
      expect(overRow?.members_capped).toBe(true)
      expect(Number(overRow?.trending_score)).toBe(4)
      expect(byId.has(privateOnly.id)).toBe(false)
      expect(byId.has(unreviewed.id)).toBe(false)
    } finally {
      restore()
      await refreshMaterializedViewForTest('mv_trending_communities', undefined, () =>
        syncTrendingCommunityMemberCountCap(),
      )
    }
  })
})

async function refreshAndReadScores(
  ids: readonly string[],
): Promise<{ id: string; trending_score: number; members_capped: boolean }[]> {
  let rows: { id: string; trending_score: number; members_capped: boolean }[] = []
  await refreshMaterializedViewForTest(
    'mv_trending_communities',
    async client => {
      const result = await client.query<{
        id: string
        trending_score: number
        members_capped: boolean
      }>(
        `/* refreshAndReadScores */ SELECT id, trending_score, members_capped
       FROM mv_trending_communities
       WHERE id = ANY($1::uuid[])`,
        [ids],
      )
      rows = result.rows
    },
    () => syncTrendingCommunityMemberCountCap(),
  )
  return rows
}

async function reviewedPost(communityId: string, userId: string, label: string): Promise<void> {
  const postId = await insertTestPost({
    title: `Trending ${label}`,
    slug: `trending-cap-post-${label}`,
    createdById: userId,
    markdown: 'A reviewed public post',
    communityId,
    privacy: 'public',
    broadcast: 'everyone',
  })
  await insertTestCommunityPostReview({
    communityId,
    postId,
    submittedById: userId,
  })
}
