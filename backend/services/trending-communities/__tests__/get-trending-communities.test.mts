import { describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { getCommunityMetrics } from '@services/communities/metrics'
import { getTrendingCommunities } from '../get-trending-communities.mts'

const mockCommunityId = '01900000-0000-7000-8000-000000000001'

describe('getTrendingCommunities query shape', () => {
  it('scores with set-based aggregates instead of view_community_metrics', async () => {
    const mockRead = vi.fn<VitestLooseMock>().mockResolvedValueOnce({
      rows: [
        {
          id: mockCommunityId,
          trending_score: 7,
          member_count: 0,
          post_count: 7,
          virtual_subscription_count: 0,
        },
      ],
    })

    const result = await getTrendingCommunities({ limit: 10 }, { read: mockRead })
    const query = mockRead.mock.calls[0]![0] as string
    const values = mockRead.mock.calls[0]![1] as unknown[]

    expect(query).toContain('/* getTrendingCommunities */')
    expect(query).not.toContain('view_community_metrics')
    expect(query).toContain('FROM community_members')
    expect(query).toContain('GROUP BY cm.community_id')
    expect(query).toContain('GROUP BY r.object_id')
    expect(query).toContain('COALESCE(mc.member_count, 0) AS member_count')
    expect(query).toContain('COALESCE(cand.post_count, 0) AS post_count')
    expect(query).toContain('WITH candidate_reviewed_posts AS')
    expect(query).toContain('windowed_post_counts AS')
    expect(query).toContain('candidates AS')
    expect(query).toContain('INNER JOIN candidates cand')
    expect(values.at(-1)).toBe(11)
    expect(result.communities[0]).toMatchObject({
      id: mockCommunityId,
      member_count: 0,
      post_count: 7,
      trending_score: 7,
      virtual_subscription_count: 0,
    })
  })
})

describe('getTrendingCommunities scoring inputs', () => {
  it('matches view_community_metrics counts for fixture communities', async () => {
    const owner = await createTestUser()
    const extraHighMember = await createTestUser()
    const extraHighMemberTwo = await createTestUser()
    const high = await insertTestCommunity({ createdById: owner.id })
    const low = await insertTestCommunity({ createdById: owner.id })

    await insertTestCommunityMember({
      communityId: high.id,
      userId: owner.id,
      role: 'owner',
    })
    await insertTestCommunityMember({
      communityId: high.id,
      userId: extraHighMember.id,
    })
    await insertTestCommunityMember({
      communityId: high.id,
      userId: extraHighMemberTwo.id,
    })
    await insertTestCommunityMember({
      communityId: low.id,
      userId: owner.id,
      role: 'owner',
    })

    const highMetrics = await getCommunityMetrics(high.id)
    const lowMetrics = await getCommunityMetrics(low.id)

    expect(highMetrics).toMatchObject({
      id: high.id,
      member_count: 3,
      post_count: 0,
      virtual_subscription_count: 0,
    })
    expect(lowMetrics).toMatchObject({
      id: low.id,
      member_count: 1,
      post_count: 0,
      virtual_subscription_count: 0,
    })
  })
})
