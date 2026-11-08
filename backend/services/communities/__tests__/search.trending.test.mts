import { it, expect, describe } from 'vitest'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
} from '@voucha/test-helpers'
import { refreshMaterializedViewForTest } from '../../../test-helpers/refresh-materialized-view-for-test.mts'
import { searchCommunities } from '../search.mts'

describe('search (sort=trending)', () => {
  it('limits trending communities to the ones the member belongs to', async () => {
    const rand = createRandomString(8)
    const owner = await createTestUser()
    const member = await createTestUser()
    const [joined, other] = await Promise.all(
      ['joined', 'other'].map(async label => {
        const community = await insertTestCommunity({
          createdById: owner.id,
          slug: `trending-member-${label}-${rand}`,
          visibility: 'public',
        })
        await insertTestCommunityMember({
          communityId: community.id,
          userId: owner.id,
          role: 'owner',
        })
        const postId = await insertTestPost({
          title: `Trending ${label} ${rand}`,
          slug: `trending-member-post-${label}-${rand}`,
          createdById: owner.id,
          markdown: `A reviewed post ${label}`,
          communityId: community.id,
          privacy: 'public',
          broadcast: 'everyone',
        })
        await insertTestCommunityPostReview({
          communityId: community.id,
          postId,
          submittedById: owner.id,
        })
        return community
      }),
    )
    await insertTestCommunityMember({ communityId: joined.id, userId: member.id })
    await refreshMaterializedViewForTest('mv_trending_communities')

    const ids = (
      await searchCommunities({ currentUser: member, memberUserId: member.id, sort: 'trending' })
    ).results.map(community => community.id)

    expect(ids).toContain(joined.id)
    expect(ids).not.toContain(other.id)
  })
})
