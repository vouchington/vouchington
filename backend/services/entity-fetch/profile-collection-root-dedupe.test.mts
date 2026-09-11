import { describe, expect, it } from 'vitest'
import {
  countCapturedQueriesByAnnotation,
  createRandomString,
  createTestUser,
  enableQueryCapture,
  insertEntityRelation,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
  safeUsername,
  stopTestQueryCapture,
} from '@voucha/test-helpers'
import { getUserPostsCollection } from './profile-collections.mts'

describe('profile collection root visibility', () => {
  it('checks shared-root comments in one permission-aware collection query', async () => {
    const suffix = `comment-root-dedupe-${createRandomString(8)}`
    const owner = await createTestUser({ username: safeUsername('root-owner') })
    const member = await createTestUser({ username: safeUsername('root-member') })
    if (!owner || !member) throw new Error('Failed to create test users')

    const community = await insertTestCommunity({
      createdById: owner.id,
      visibility: 'private',
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    const rootPostId = await insertTestPost({
      title: `Shared root post ${suffix}`,
      slug: `shared-root-post-${suffix}`,
      createdById: owner.id,
      markdown: 'shared root content',
      communityId: community.id,
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: rootPostId,
      submittedById: owner.id,
    })

    const firstCommentId = await insertTestPost({
      title: `First shared root comment ${suffix}`,
      slug: `first-shared-root-comment-${suffix}`,
      createdById: owner.id,
      markdown: 'first shared root comment',
      postType: 'comment',
      rootId: rootPostId,
      parentId: rootPostId,
      communityId: community.id,
    })
    const secondCommentId = await insertTestPost({
      title: `Second shared root comment ${suffix}`,
      slug: `second-shared-root-comment-${suffix}`,
      createdById: owner.id,
      markdown: 'second shared root comment',
      postType: 'comment',
      rootId: rootPostId,
      parentId: rootPostId,
      communityId: community.id,
    })
    await insertEntityRelation('relation__user__save__post', member.id, firstCommentId)
    await insertEntityRelation('relation__user__save__post', member.id, secondCommentId)

    const { result: collection, queries } = await captureQueries(() =>
      getUserPostsCollection(member, member.id, 'saved'),
    )
    const savedPosts = collection.results
    const ids = savedPosts.map(post => post.id)
    expect(ids).toContain(firstCommentId)
    expect(ids).toContain(secondCommentId)

    expect(countCapturedQueriesByAnnotation(queries, 'getVisiblePostCollectionRows')).toBe(1)
    expect(countCapturedQueriesByAnnotation(queries, 'canViewCommunityScopesBatch')).toBe(0)
    expect(countCapturedQueriesByAnnotation(queries, 'getPostByAny')).toBe(0)
    expect(countCapturedQueriesByAnnotation(queries, 'canViewCommunityScope')).toBe(0)
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
