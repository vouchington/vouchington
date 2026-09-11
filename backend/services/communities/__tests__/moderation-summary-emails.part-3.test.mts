import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { insertTestPendingCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { getCommunityModerationSummaryCommunities } from '../moderation-summary-emails.mts'
import { deleteUser } from '../../users/delete.mts'

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const ONE_WEEK_MS = 7 * ONE_DAY_MS

describe('getCommunityModerationSummaryCommunities activity digest engagement', () => {
  it('excludes comments from the post-type breakdown but counts commenters as active members', async () => {
    const owner = await createTestUser()
    const commenter = await createTestUser()
    const before = new Date(Date.now() - 30 * ONE_DAY_MS)

    const community = await insertTestCommunity({ createdById: owner!.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner!.id,
      role: 'owner',
      approvedById: owner!.id,
      createdAt: before,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: commenter!.id,
      role: 'member',
      approvedById: owner!.id,
      createdAt: before,
    })

    const parentPostId = await insertTestPost({
      title: 'Parent discussion',
      slug: `comment-only-parent-${owner!.id}`,
      createdById: owner!.id,
      markdown: 'Parent.',
      communityId: community.id,
      postType: 'discussion',
      createdAt: before,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId: parentPostId,
      submittedById: owner!.id,
    })
    await insertTestPost({
      title: 'Just a comment',
      slug: `comment-only-reply-${owner!.id}`,
      createdById: commenter!.id,
      markdown: 'Just a comment.',
      communityId: community.id,
      postType: 'comment',
      parentId: parentPostId,
    })

    const windowStart = new Date(Date.now() - ONE_WEEK_MS)
    const windowEnd = new Date(Date.now() + ONE_DAY_MS)
    const communities = await getCommunityModerationSummaryCommunities(
      owner!.id,
      windowStart,
      windowEnd,
    )
    const found = communities.find(c => c.name === community.name)

    expect(found).toBeDefined()
    expect(found!.newDiscussionPosts).toBe(0)
    expect(found!.newReviewPosts).toBe(0)
    expect(found!.newDataPointPosts).toBe(0)
    expect(found!.activeMemberCount).toBe(1)
  })

  it('excludes deleted-account members from totalActiveMembers', async () => {
    const owner = await createTestUser()
    const departedAccountMember = await createTestUser()
    const before = new Date(Date.now() - 30 * ONE_DAY_MS)

    const community = await insertTestCommunity({ createdById: owner!.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner!.id,
      role: 'owner',
      approvedById: owner!.id,
      createdAt: before,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: departedAccountMember!.id,
      role: 'member',
      approvedById: owner!.id,
      createdAt: before,
    })

    const pendingPostId = await insertTestPost({
      title: 'Needs review',
      slug: `deleted-member-pending-${owner!.id}`,
      createdById: owner!.id,
      markdown: 'Needs review.',
      communityId: community.id,
      postType: 'discussion',
      createdAt: before,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId: pendingPostId,
      submittedById: owner!.id,
    })

    await deleteUser(departedAccountMember!, departedAccountMember!)

    const windowStart = new Date(Date.now() - ONE_WEEK_MS)
    const communities = await getCommunityModerationSummaryCommunities(
      owner!.id,
      windowStart,
      new Date(),
    )
    const found = communities.find(c => c.name === community.name)

    expect(found).toBeDefined()
    expect(found!.totalActiveMembers).toBe(1)
  })

  it('excludes activity created after the window end', async () => {
    const owner = await createTestUser()
    const before = new Date(Date.now() - 30 * ONE_DAY_MS)

    const community = await insertTestCommunity({ createdById: owner!.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner!.id,
      role: 'owner',
      approvedById: owner!.id,
      createdAt: before,
    })

    const windowStart = new Date(Date.now() - ONE_WEEK_MS)
    const windowEnd = new Date()

    const withinWindowPostId = await insertTestPost({
      title: 'Within window',
      slug: `window-end-in-window-${owner!.id}`,
      createdById: owner!.id,
      markdown: 'In window.',
      communityId: community.id,
      postType: 'discussion',
      createdAt: new Date(windowEnd.getTime() - ONE_DAY_MS),
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId: withinWindowPostId,
      submittedById: owner!.id,
    })

    await insertTestPost({
      title: 'After window end',
      slug: `window-end-after-window-${owner!.id}`,
      createdById: owner!.id,
      markdown: 'Simulates activity created after a delayed job already claimed its digest window.',
      communityId: community.id,
      postType: 'discussion',
    })

    const communities = await getCommunityModerationSummaryCommunities(
      owner!.id,
      windowStart,
      windowEnd,
    )
    const found = communities.find(c => c.name === community.name)

    expect(found).toBeDefined()
    expect(found!.newDiscussionPosts).toBe(1)
  })

  it('excludes replies posted after the window end from topDiscussionReplyCount', async () => {
    const owner = await createTestUser()
    const commenter = await createTestUser()
    const before = new Date(Date.now() - 30 * ONE_DAY_MS)

    const community = await insertTestCommunity({ createdById: owner!.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner!.id,
      role: 'owner',
      approvedById: owner!.id,
      createdAt: before,
    })

    const windowStart = new Date(Date.now() - ONE_WEEK_MS)
    const windowEnd = new Date()

    const topDiscussionId = await insertTestPost({
      title: 'Top discussion',
      slug: `window-end-reply-discussion-${owner!.id}`,
      createdById: owner!.id,
      markdown: 'Discuss.',
      communityId: community.id,
      postType: 'discussion',
      createdAt: new Date(windowEnd.getTime() - ONE_DAY_MS),
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId: topDiscussionId,
      submittedById: owner!.id,
    })
    await insertTestPost({
      title: 'In-window reply',
      slug: `window-end-reply-in-window-${owner!.id}`,
      createdById: commenter!.id,
      markdown: 'In window reply.',
      communityId: community.id,
      postType: 'comment',
      parentId: topDiscussionId,
      createdAt: new Date(windowEnd.getTime() - ONE_DAY_MS / 2),
    })

    await insertTestPost({
      title: 'After-window reply',
      slug: `window-end-reply-after-window-${owner!.id}`,
      createdById: commenter!.id,
      markdown: 'Simulates a reply posted after a delayed job already claimed its digest window.',
      communityId: community.id,
      postType: 'comment',
      parentId: topDiscussionId,
    })

    const communities = await getCommunityModerationSummaryCommunities(
      owner!.id,
      windowStart,
      windowEnd,
    )
    const found = communities.find(c => c.name === community.name)

    expect(found).toBeDefined()
    expect(found!.topDiscussionReplyCount).toBe(1)
  })
})
