import { describe, expect, it } from 'vitest'

import {
  archiveTestCommunity,
  countPostOccurrencesInPublicEligibilityView,
  createTestRssFeedItemWithUrl,
  createTestUser,
  deleteTestCommunity,
  deleteTestPost,
  getPostIdsByCandidateRootFilter,
  insertTestCommunity,
  insertTestCommunityPostReview,
  insertTestPost,
  insertTestPostStory,
  insertTestRssFeedDirect,
  insertTestStory,
  insertTestUrlDirect,
  isPostInPublicEligibilityView,
  setTestItemStoryId,
  setTestPostClearanceStatus,
  suspendTestUser,
  unsuspendTestUser,
  updateTestCommunityPostReviewState,
} from '@voucha/test-helpers'
import { setTestRssFeedDiscoverable } from '@voucha/test-helpers/entities/rss-feeds-discovery'
import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
import { archivePost, unarchivePost } from '../archive.mts'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('buildPublicPostEligibilityFilter — persisted publication state', () => {
  it('compiles against PostgreSQL and excludes an actively suspended author', async () => {
    const suffix = randomSuffix()
    const author = await createTestUser({ username: `public-builder-${suffix}` })
    if (!author) throw new Error('Failed to create test author')
    const postId = await insertTestPost({
      createdById: author.id,
      title: `public builder ${suffix}`,
      slug: `public-builder-${suffix}`,
      markdown: 'public',
    })
    await expect(isPubliclyEligible(postId)).resolves.toBe(true)
    await suspendTestUser(author.id, 'publication eligibility test')
    await expect(isPubliclyEligible(postId)).resolves.toBe(false)
    await unsuspendTestUser(author.id)
    await expect(isPubliclyEligible(postId)).resolves.toBe(true)
  })

  it('requires independently publishable candidate and root state across public surfaces', async () => {
    const suffix = randomSuffix()
    const author = await createTestUser({ username: `public-matrix-${suffix}` })
    if (!author) throw new Error('Failed to create test author')
    const createPost = (overrides: Partial<Parameters<typeof insertTestPost>[0]> = {}) =>
      insertTestPost({
        createdById: author.id,
        title: `public matrix ${suffix}`,
        slug: `public-matrix-${suffix}-${Math.random().toString(36).slice(2, 6)}`,
        markdown: 'public',
        ...overrides,
      })
    const discussionId = await createPost({ postType: 'discussion' })
    const reviewId = await createPost({ postType: 'review' })
    const dataPointId = await createPost({ postType: 'data_point' })
    const linkUrl = await insertTestUrlDirect(null, `https://public-matrix-${suffix}.example.com`)
    if (!linkUrl) throw new Error('Failed to create link URL')
    const linkId = await createPost({ postType: 'link', urlId: linkUrl.id })
    const historicalArticleId = await createPost({ postType: 'article' })
    const historicalBlogPostId = await createPost({ postType: 'blog_post' })
    for (const postId of [
      discussionId,
      reviewId,
      dataPointId,
      linkId,
      historicalArticleId,
      historicalBlogPostId,
    ]) {
      await expect(isPubliclyEligible(postId)).resolves.toBe(true)
    }
    const rejectedCandidateId = await createPost({
      postType: 'comment',
      rootId: discussionId,
      parentId: discussionId,
      clearanceStatus: 'rejected',
    })
    const inReviewRootId = await createPost({ clearanceStatus: 'in_review' })
    const approvedCandidateOnInReviewRootId = await createPost({
      postType: 'comment',
      rootId: inReviewRootId,
      parentId: inReviewRootId,
    })
    await expect(isPubliclyEligible(rejectedCandidateId)).resolves.toBe(false)
    await expect(isPubliclyEligible(approvedCandidateOnInReviewRootId)).resolves.toBe(false)
    await expect(isPubliclyEligible(await createPost({ broadcast: 'users' }))).resolves.toBe(false)
    const archivedCandidateId = await createPost()
    const archivedRootId = await createPost()
    const candidateOnArchivedRootId = await createPost({
      postType: 'comment',
      rootId: archivedRootId,
      parentId: archivedRootId,
    })
    await archivePost(archivedCandidateId, author.id)
    await archivePost(archivedRootId, author.id)
    await expect(isPubliclyEligible(archivedCandidateId)).resolves.toBe(false)
    await expect(isPubliclyEligible(candidateOnArchivedRootId)).resolves.toBe(false)
    const publicCommunity = await insertTestCommunity({ createdById: author.id })
    const approvedCommunityPostId = await createPost({ communityId: publicCommunity.id })
    await insertTestCommunityPostReview({
      communityId: publicCommunity.id,
      postId: approvedCommunityPostId,
      submittedById: author.id,
    })
    await expect(isPubliclyEligible(approvedCommunityPostId)).resolves.toBe(true)
    await expect(
      isPubliclyEligible(await createPost({ communityId: publicCommunity.id })),
    ).resolves.toBe(false)
    const privateCommunity = await insertTestCommunity({
      createdById: author.id,
      visibility: 'private',
    })
    const privateCommunityPostId = await createPost({ communityId: privateCommunity.id })
    await insertTestCommunityPostReview({
      communityId: privateCommunity.id,
      postId: privateCommunityPostId,
      submittedById: author.id,
    })
    await expect(isPubliclyEligible(privateCommunityPostId)).resolves.toBe(false)
    // Generic readers own the type exclusion; this persisted predicate must stay equivalent to its view.
    await expect(
      isPubliclyEligible(await createPost({ postType: 'topic_recommendation' })),
    ).resolves.toBe(true)
  })

  it('tracks candidate and root clearance, deletion, and archive state through transitions', async () => {
    const suffix = randomSuffix()
    const author = await createTestUser({ username: `public-transitions-${suffix}` })
    if (!author) throw new Error('Failed to create test author')
    const createPost = (overrides: Partial<Parameters<typeof insertTestPost>[0]> = {}) =>
      insertTestPost({
        createdById: author.id,
        title: `public transitions ${suffix}`,
        slug: `public-transitions-${suffix}-${Math.random().toString(36).slice(2, 6)}`,
        markdown: 'public',
        ...overrides,
      })
    const rootId = await createPost()
    const candidateId = await createPost({ postType: 'comment', rootId, parentId: rootId })
    await expect(isPubliclyEligible(candidateId)).resolves.toBe(true)
    for (const status of ['pending', 'in_review', 'rejected'] as const) {
      await setTestPostClearanceStatus(candidateId, status, author.id)
      await expect(isPubliclyEligible(candidateId)).resolves.toBe(false)
    }
    await setTestPostClearanceStatus(candidateId, 'approved', author.id)
    await expect(isPubliclyEligible(candidateId)).resolves.toBe(true)
    await setTestPostClearanceStatus(rootId, 'in_review', author.id)
    await expect(isPubliclyEligible(candidateId)).resolves.toBe(false)
    await setTestPostClearanceStatus(rootId, 'approved', author.id)
    await expect(isPubliclyEligible(candidateId)).resolves.toBe(true)
    await archivePost(candidateId, author.id)
    await expect(isPubliclyEligible(candidateId)).resolves.toBe(false)
    await unarchivePost(candidateId)
    await expect(isPubliclyEligible(candidateId)).resolves.toBe(true)
    const deletedCandidateId = await createPost()
    await deleteTestPost(deletedCandidateId)
    await expect(isPubliclyEligible(deletedCandidateId)).resolves.toBe(false)
    const deletedRootId = await createPost()
    const candidateOnDeletedRootId = await createPost({
      postType: 'comment',
      rootId: deletedRootId,
      parentId: deletedRootId,
    })
    await deleteTestPost(deletedRootId)
    await expect(isPubliclyEligible(candidateOnDeletedRootId)).resolves.toBe(false)
  })

  it('requires a discoverable story source and restores eligibility when it returns', async () => {
    const suffix = randomSuffix()
    const author = await createTestUser({ username: `public-story-${suffix}` })
    if (!author) throw new Error('Failed to create test author')
    const storyPostId = await insertTestPost({
      createdById: author.id,
      title: `public story ${suffix}`,
      slug: `public-story-${suffix}`,
      markdown: '',
      postType: 'story',
    })
    const feed = await insertTestRssFeedDirect({})
    const item = await createTestRssFeedItemWithUrl(feed.id)
    const story = await insertTestStory()
    await setTestItemStoryId(item.id, story.id)
    await insertTestPostStory(storyPostId, story.id, author.id)
    await expect(isPubliclyEligible(storyPostId)).resolves.toBe(true)
    await setTestRssFeedDiscoverable(feed.id, false)
    await expect(isPubliclyEligible(storyPostId)).resolves.toBe(false)
    await setTestRssFeedDiscoverable(feed.id, true)
    await expect(isPubliclyEligible(storyPostId)).resolves.toBe(true)
    await setTestItemStoryId(item.id, null)
    await expect(isPubliclyEligible(storyPostId)).resolves.toBe(false)
    await setTestItemStoryId(item.id, story.id)
    await expect(isPubliclyEligible(storyPostId)).resolves.toBe(true)
  })

  it('requires an active approved public community publication and restores it after loss', async () => {
    const suffix = randomSuffix()
    const author = await createTestUser({ username: `public-community-${suffix}` })
    if (!author) throw new Error('Failed to create test author')
    const createCommunityPost = async () => {
      const community = await insertTestCommunity({ createdById: author.id })
      const postId = await insertTestPost({
        createdById: author.id,
        title: `public community ${suffix}`,
        slug: `public-community-${suffix}-${Math.random().toString(36).slice(2, 6)}`,
        markdown: 'public',
        communityId: community.id,
      })
      await insertTestCommunityPostReview({
        communityId: community.id,
        postId,
        submittedById: author.id,
      })
      return { community, postId }
    }
    const rejected = await createCommunityPost()
    await expect(isPubliclyEligible(rejected.postId)).resolves.toBe(true)
    await updateTestCommunityPostReviewState({
      communityId: rejected.community.id,
      postId: rejected.postId,
      approvedAt: null,
      rejectedAt: new Date(),
    })
    await expect(isPubliclyEligible(rejected.postId)).resolves.toBe(false)
    const unpublished = await createCommunityPost()
    await updateTestCommunityPostReviewState({
      communityId: unpublished.community.id,
      postId: unpublished.postId,
      unpublishedAt: new Date(),
    })
    await expect(isPubliclyEligible(unpublished.postId)).resolves.toBe(false)
    await updateTestCommunityPostReviewState({
      communityId: unpublished.community.id,
      postId: unpublished.postId,
      unpublishedAt: null,
    })
    await expect(isPubliclyEligible(unpublished.postId)).resolves.toBe(true)
    const archived = await createCommunityPost()
    await archiveTestCommunity({ communityId: archived.community.id, archivedById: author.id })
    await expect(isPubliclyEligible(archived.postId)).resolves.toBe(false)
    const deleted = await createCommunityPost()
    await deleteTestCommunity({ communityId: deleted.community.id, deletedById: author.id })
    await expect(isPubliclyEligible(deleted.postId)).resolves.toBe(false)
  })

  it('resolves a nested reply chain against its direct root_id target and emits it exactly once', async () => {
    const suffix = randomSuffix()
    const author = await createTestUser({ username: `public-nested-${suffix}` })
    if (!author) throw new Error('Failed to create test author')
    const createPost = (overrides: Partial<Parameters<typeof insertTestPost>[0]> = {}) =>
      insertTestPost({
        createdById: author.id,
        title: `public nested ${suffix}`,
        slug: `public-nested-${suffix}-${Math.random().toString(36).slice(2, 6)}`,
        markdown: 'public',
        ...overrides,
      })
    // The DB permits a "root" whose own root_id is itself non-null (no flat-tree constraint):
    // topRootId <- midId <- replyId, where replyId.root_id points at midId, not topRootId.
    // COALESCE(candidate_post.root_id, candidate_post.id) resolves replyId's access post to
    // exactly one row — whatever replyId.root_id names — the same single-row resolution the
    // pre-fix UNION ALL branch 2 used (`candidate_post.root_id = eligible_root_posts.id`, against
    // any row, not only true top-level ones). It must not walk the chain transitively to
    // topRootId, and it must never emit replyId more than once.
    const topRootId = await createPost()
    const midId = await createPost({ postType: 'comment', rootId: topRootId, parentId: topRootId })
    const replyId = await createPost({ postType: 'comment', rootId: midId, parentId: midId })
    await expect(isPubliclyEligible(replyId)).resolves.toBe(true)
    await expect(countPostOccurrencesInPublicEligibilityView(replyId)).resolves.toBe(1)

    // Rejecting the direct root_id target (midId) removes eligibility...
    await setTestPostClearanceStatus(midId, 'rejected', author.id)
    await expect(isPubliclyEligible(replyId)).resolves.toBe(false)
    await expect(countPostOccurrencesInPublicEligibilityView(replyId)).resolves.toBe(0)
    await setTestPostClearanceStatus(midId, 'approved', author.id)
    await expect(isPubliclyEligible(replyId)).resolves.toBe(true)

    // ...but rejecting the transitive top-level ancestor (topRootId) does not: resolution stops
    // at replyId.root_id (midId) and never consults topRootId.
    await setTestPostClearanceStatus(topRootId, 'rejected', author.id)
    await expect(isPubliclyEligible(replyId)).resolves.toBe(true)
    await expect(countPostOccurrencesInPublicEligibilityView(replyId)).resolves.toBe(1)
  })
})

async function isPubliclyEligible(postId: string): Promise<boolean> {
  const eligibility = buildPublicPostEligibilityFilter('candidate_post', 'access_post')
  const [builderResult, viewResult] = await Promise.all([
    getPostIdsByCandidateRootFilter(eligibility).then(ids => ids.includes(postId)),
    isPostInPublicEligibilityView(postId),
  ])
  expect(viewResult).toBe(builderResult)
  return builderResult
}
