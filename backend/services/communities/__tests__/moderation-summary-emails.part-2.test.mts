import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  readAllQueueJobs,
  removeTestCommunityMember,
} from '@voucha/test-helpers'
import { insertTestPendingCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { emails } from '@queues/emails/queues'
import { updateUserFields } from '@services/users/update-fields'
import { deleteUser } from '@services/users/delete'
import {
  dispatchCommunityModerationSummaryEmails,
  getCommunityModerationSummaryCommunities,
} from '../moderation-summary-emails.mts'

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const ONE_WEEK_MS = 7 * ONE_DAY_MS

describe('getCommunityModerationSummaryCommunities activity digest', () => {
  it('populates membership, post-type, top-discussion, and engagement fields within the window', async () => {
    const owner = await createTestUser()
    const commenter = await createTestUser()
    const newMember = await createTestUser()
    const departingMember = await createTestUser()
    const deletedNewMember = await createTestUser()
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

    // Gating fixture, backdated so it does not inflate the in-window discussion count below.
    const pendingPostId = await insertTestPost({
      title: 'Needs review',
      slug: `activity-digest-pending-${owner!.id}`,
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

    const topDiscussionId = await insertTestPost({
      title: 'Best credit card for a trip?',
      slug: `activity-digest-top-discussion-${owner!.id}`,
      createdById: owner!.id,
      markdown: 'Discuss.',
      communityId: community.id,
      postType: 'discussion',
    })
    await insertTestPost({
      title: 'Quiet discussion',
      slug: `activity-digest-quiet-discussion-${owner!.id}`,
      createdById: owner!.id,
      markdown: 'Discuss.',
      communityId: community.id,
      postType: 'discussion',
    })
    await insertTestPost({
      title: 'A review',
      slug: `activity-digest-review-${owner!.id}`,
      createdById: owner!.id,
      markdown: 'Review body.',
      communityId: community.id,
      postType: 'review',
    })
    await insertTestPost({
      title: 'A data point',
      slug: `activity-digest-data-point-${owner!.id}`,
      createdById: owner!.id,
      markdown: 'Data.',
      communityId: community.id,
      postType: 'data_point',
    })
    await insertTestPost({
      title: 'Reply 1',
      slug: `activity-digest-reply-1-${owner!.id}`,
      createdById: commenter!.id,
      markdown: 'Reply 1',
      communityId: community.id,
      postType: 'comment',
      parentId: topDiscussionId,
    })
    await insertTestPost({
      title: 'Reply 2',
      slug: `activity-digest-reply-2-${owner!.id}`,
      createdById: commenter!.id,
      markdown: 'Reply 2',
      communityId: community.id,
      postType: 'comment',
      parentId: topDiscussionId,
    })

    await insertTestCommunityMember({
      communityId: community.id,
      userId: newMember!.id,
      role: 'member',
      approvedById: owner!.id,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: departingMember!.id,
      role: 'member',
      approvedById: owner!.id,
    })
    await removeTestCommunityMember(community.id, departingMember!.id)

    // Joined within the window, then deleted their account (without leaving the community) —
    // must not inflate new_members since departed_members won't offset a deleted (not removed) member.
    await insertTestCommunityMember({
      communityId: community.id,
      userId: deletedNewMember!.id,
      role: 'member',
      approvedById: owner!.id,
    })
    await deleteUser(deletedNewMember!, deletedNewMember!)

    const windowStart = new Date(Date.now() - ONE_WEEK_MS)
    const communities = await getCommunityModerationSummaryCommunities(
      owner!.id,
      windowStart,
      new Date(),
    )
    const found = communities.find(c => c.name === community.name)

    expect(found).toBeDefined()
    expect(found!.newDiscussionPosts).toBe(2)
    expect(found!.newReviewPosts).toBe(1)
    expect(found!.newDataPointPosts).toBe(1)
    expect(found!.topDiscussionTitle).toBe('Best credit card for a trip?')
    expect(found!.topDiscussionReplyCount).toBe(2)
    expect(found!.netMemberChange).toBe(1)
    expect(found!.totalActiveMembers).toBe(3)
    expect(found!.activeMemberCount).toBe(2)
    expect(found!.activeMemberRate).toBeCloseTo(2 / 3, 5)
  })

  it('does not send when there is activity but no pending moderation work', async () => {
    const user = await createTestUser()
    const activityMember = await createTestUser()
    const moderationEmailTime = new Date().toISOString().slice(11, 16)
    await updateUserFields(user!.id, {
      moderation_emails_enabled: true,
      moderation_email_cadence: 'daily',
      moderation_email_days_of_week: [1, 2, 3, 4, 5, 6, 7],
      moderation_email_time_of_day: moderationEmailTime,
      moderation_email_timezone: 'UTC',
    })
    const community = await insertTestCommunity({ createdById: user!.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: user!.id,
      role: 'owner',
      approvedById: user!.id,
    })
    await insertTestPost({
      title: 'Nonzero activity, zero moderation work',
      slug: `activity-only-post-${user!.id}`,
      createdById: user!.id,
      markdown: 'Just chatting.',
      communityId: community.id,
      postType: 'discussion',
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: activityMember!.id,
      role: 'member',
      approvedById: user!.id,
    })

    await dispatchCommunityModerationSummaryEmails()

    const jobs = await readAllQueueJobs(emails)
    expect(
      jobs.some(job => {
        const data = job.data as { input?: { userId?: string } }
        return (
          job.name === 'processSendCommunityModerationSummaryEmail' &&
          data.input?.userId === user!.id
        )
      }),
    ).toBe(false)
  })

  it('excludes posts and members created before the activity window', async () => {
    const owner = await createTestUser()
    const outsideMember = await createTestUser()
    const outsideWindow = new Date(Date.now() - 30 * ONE_DAY_MS)

    const community = await insertTestCommunity({ createdById: owner!.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner!.id,
      role: 'owner',
      approvedById: owner!.id,
      createdAt: outsideWindow,
    })

    const pendingPostId = await insertTestPost({
      title: 'Needs review outside window',
      slug: `outside-window-pending-${owner!.id}`,
      createdById: owner!.id,
      markdown: 'Needs review.',
      communityId: community.id,
      postType: 'discussion',
      createdAt: outsideWindow,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId: pendingPostId,
      submittedById: owner!.id,
    })
    await insertTestPost({
      title: 'Old discussion',
      slug: `outside-window-discussion-${owner!.id}`,
      createdById: owner!.id,
      markdown: 'Old.',
      communityId: community.id,
      postType: 'discussion',
      createdAt: outsideWindow,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: outsideMember!.id,
      role: 'member',
      approvedById: owner!.id,
      createdAt: outsideWindow,
    })

    const windowStart = new Date(Date.now() - ONE_DAY_MS)
    const communities = await getCommunityModerationSummaryCommunities(
      owner!.id,
      windowStart,
      new Date(),
    )
    const found = communities.find(c => c.name === community.name)

    expect(found).toBeDefined()
    expect(found!.newDiscussionPosts).toBe(0)
    expect(found!.newReviewPosts).toBe(0)
    expect(found!.newDataPointPosts).toBe(0)
    expect(found!.netMemberChange).toBe(0)
    expect(found!.totalActiveMembers).toBe(2)
  })
})
