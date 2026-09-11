import { describe, expect, it } from 'vitest'
import {
  countCapturedQueriesByAnnotation,
  createTestUser,
  enableQueryCapture,
  insertEntityRelation,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestLocalFollow,
  insertTestPost,
  stopTestQueryCapture,
} from '@voucha/test-helpers'
import { getUserCommunitiesCollection, getUserPostsCollection } from './profile-collections.mts'

describe('profile-collection-filters', () => {
  it('returns only public communities for anonymous viewer', async () => {
    const suffix = `anon-filter-${Date.now()}`
    const owner = await createTestUser({ username: `anon-owner-${suffix}` })
    if (!owner) throw new Error('Failed to create owner')

    const publicCommunity = await insertTestCommunity({ createdById: owner.id })
    const privateCommunity = await insertTestCommunity({
      createdById: owner.id,
      visibility: 'private',
    })

    await insertEntityRelation('relation__user__save__community', owner.id, publicCommunity.id)
    await insertEntityRelation('relation__user__save__community', owner.id, privateCommunity.id)

    const { results } = await getUserCommunitiesCollection(null, owner.id, 'saved')
    const ids = results.map(c => c.id)
    expect(ids).toContain(publicCommunity.id)
    expect(ids).not.toContain(privateCommunity.id)
  })

  it('returns all communities for administrator viewer', async () => {
    const suffix = `admin-filter-${Date.now()}`
    const owner = await createTestUser({ username: `admin-owner-${suffix}` })
    const admin = await createTestUser({ username: `admin-user-${suffix}`, administrator: true })
    if (!owner || !admin) throw new Error('Failed to create test users')

    const privateCommunity = await insertTestCommunity({
      createdById: owner.id,
      visibility: 'private',
    })
    await insertEntityRelation('relation__user__save__community', admin.id, privateCommunity.id)

    const { results } = await getUserCommunitiesCollection(admin, admin.id, 'saved')
    expect(results.map(c => c.id)).toContain(privateCommunity.id)
  })

  it('filters topic_recommendation posts from collection results', async () => {
    const suffix = `topic-rec-${Date.now()}`
    const owner = await createTestUser({ username: `rec-owner-${suffix}` })
    if (!owner) throw new Error('Failed to create owner')

    const recPostId = await insertTestPost({
      title: `Recommendation ${suffix}`,
      slug: `rec-${suffix}`,
      createdById: owner.id,
      markdown: 'recommendation content',
      postType: 'topic_recommendation',
    })
    await insertEntityRelation('relation__user__save__post', owner.id, recPostId)

    const { results: savedPosts } = await getUserPostsCollection(owner, owner.id, 'saved')
    expect(savedPosts.map(p => p.id)).not.toContain(recPostId)
  })

  it('checks comment collection visibility against the root post', async () => {
    const suffix = `comment-root-${Date.now()}`
    const owner = await createTestUser({ username: `comment-root-owner-${suffix}` })
    if (!owner) throw new Error('Failed to create owner')

    const rootPostId = await insertTestPost({
      title: `Root post ${suffix}`,
      slug: `root-post-${suffix}`,
      createdById: owner.id,
      markdown: 'root content',
    })
    const commentId = await insertTestPost({
      title: `Comment ${suffix}`,
      slug: `comment-${suffix}`,
      createdById: owner.id,
      markdown: 'comment content',
      postType: 'comment',
      rootId: rootPostId,
      parentId: rootPostId,
    })
    await insertEntityRelation('relation__user__save__post', owner.id, commentId)

    const { results: savedPosts } = await getUserPostsCollection(owner, owner.id, 'saved')
    expect(savedPosts.map(post => post.id)).toContain(commentId)
  })

  it('batches community-scoped post visibility checks for saved posts', async () => {
    const suffix = `community-post-batch-${Date.now()}`
    const owner = await createTestUser({ username: `community-batch-owner-${suffix}` })
    const member = await createTestUser({ username: `community-batch-member-${suffix}` })
    if (!owner || !member) throw new Error('Failed to create test users')

    const community = await insertTestCommunity({
      createdById: owner.id,
      visibility: 'private',
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    const approvedPostId = await insertTestPost({
      title: `Approved community post ${suffix}`,
      slug: `approved-community-post-${suffix}`,
      createdById: owner.id,
      markdown: 'approved community content',
      communityId: community.id,
    })
    const pendingPostId = await insertTestPost({
      title: `Pending community post ${suffix}`,
      slug: `pending-community-post-${suffix}`,
      createdById: owner.id,
      markdown: 'pending community content',
      communityId: community.id,
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: approvedPostId,
      submittedById: owner.id,
    })
    await insertEntityRelation('relation__user__save__post', member.id, approvedPostId)
    await insertEntityRelation('relation__user__save__post', member.id, pendingPostId)

    const { result: collection, queries } = await captureQueries(() =>
      getUserPostsCollection(member, member.id, 'saved'),
    )
    const savedPosts = collection.results
    const ids = savedPosts.map(post => post.id)
    expect(ids).toContain(approvedPostId)
    expect(ids).not.toContain(pendingPostId)
    expect(countCapturedQueriesByAnnotation(queries, 'getVisiblePostCollectionRows')).toBe(1)
    expect(countCapturedQueriesByAnnotation(queries, 'canViewCommunityScopesBatch')).toBe(0)
    expect(countCapturedQueriesByAnnotation(queries, 'canViewCommunityScope')).toBe(0)
  })

  it('batches private broadcast visibility checks for saved posts', async () => {
    const suffix = `private-post-batch-${Date.now()}`
    const viewer = await createTestUser({ username: `private-batch-viewer-${suffix}` })
    const followerCreator = await createTestUser({ username: `private-batch-follower-${suffix}` })
    const mutualCreator = await createTestUser({ username: `private-batch-mutual-${suffix}` })
    const hiddenCreator = await createTestUser({ username: `private-batch-hidden-${suffix}` })
    if (!viewer || !followerCreator || !mutualCreator || !hiddenCreator) {
      throw new Error('Failed to create test users')
    }

    const followerPostId = await insertTestPost({
      title: `Follower-only post ${suffix}`,
      slug: `follower-only-post-${suffix}`,
      createdById: followerCreator.id,
      markdown: 'followers can see this',
      privacy: 'private',
      broadcast: 'followers',
    })
    const mutualPostId = await insertTestPost({
      title: `Mutual-only post ${suffix}`,
      slug: `mutual-only-post-${suffix}`,
      createdById: mutualCreator.id,
      markdown: 'mutual followers can see this',
      privacy: 'private',
      broadcast: 'mutual_followers',
    })
    const hiddenPostId = await insertTestPost({
      title: `Hidden mutual post ${suffix}`,
      slug: `hidden-mutual-post-${suffix}`,
      createdById: hiddenCreator.id,
      markdown: 'one-way followers cannot see this',
      privacy: 'private',
      broadcast: 'mutual_followers',
    })

    await insertTestLocalFollow(viewer.id, followerCreator.id)
    await insertTestLocalFollow(viewer.id, mutualCreator.id)
    await insertTestLocalFollow(mutualCreator.id, viewer.id)
    await insertTestLocalFollow(viewer.id, hiddenCreator.id)
    await insertEntityRelation('relation__user__save__post', viewer.id, followerPostId)
    await insertEntityRelation('relation__user__save__post', viewer.id, mutualPostId)
    await insertEntityRelation('relation__user__save__post', viewer.id, hiddenPostId)

    const { result: collection, queries } = await captureQueries(() =>
      getUserPostsCollection(viewer, viewer.id, 'saved'),
    )
    const savedPosts = collection.results
    const ids = savedPosts.map(post => post.id)
    expect(ids).toContain(followerPostId)
    expect(ids).toContain(mutualPostId)
    expect(ids).not.toContain(hiddenPostId)
    expect(countCapturedQueriesByAnnotation(queries, 'getVisiblePostCollectionRows')).toBe(1)
    expect(countCapturedQueriesByAnnotation(queries, 'canViewPrivatePostBatch')).toBe(0)
    expect(countCapturedQueriesByAnnotation(queries, 'canViewPrivatePost')).toBe(0)
  })
})

async function captureQueries<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; queries: ReturnType<typeof stopTestQueryCapture> }> {
  enableQueryCapture()
  try {
    const result = await fn()
    const queries = stopTestQueryCapture()
    return { result, queries }
  } catch (err) {
    stopTestQueryCapture()
    throw err
  }
}
