import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as ses from '@modules/aws/ses'
import {
  createTestUser,
  claimCurrentModerationSummaryForTest,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { insertTestPendingCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import {
  claimModerationEmailSend,
  formatLocalDate,
  hasModerationEmailSent,
} from '@services/communities/moderation-summary-emails'
import { createSesBounceEvent } from '@services/ses-bounce-events'
import { updateUserFields } from '@services/users/update-fields'
import { processSendCommunityModerationSummaryEmail } from './community-moderation-summary.mts'

describe('moderation summary definitive SES rejection', () => {
  beforeEach(() => {
    vi.stubEnv(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
      'test:raw32:this fake test key is not secret',
    )
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
  })

  afterEach(() => vi.unstubAllEnvs())

  it('keeps the send unmarked when classification suppresses it before SES', async () => {
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user!.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: user!.id,
      role: 'owner',
      approvedById: user!.id,
    })
    const postId = await insertTestPost({
      title: 'Suppressed moderator post',
      slug: `suppressed-moderator-post-${user!.id}`,
      createdById: user!.id,
      markdown: 'Needs review.',
      communityId: community.id,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: user!.id,
    })
    const { trackingKey, windowEnd, dispatchTimeZone } = await claimCurrentModerationSummaryForTest(
      user!.id,
    )
    const emailAddress = user!.email_address!
    await createSesBounceEvent({
      notification_type: 'bounce',
      bounce_type: 'permanent',
      recipients: [emailAddress],
      raw_message: {},
    })

    await expect(
      processSendCommunityModerationSummaryEmail(
        { emailAddress, userId: user!.id, trackingKey, windowEnd },
        {
          generatedForDate: '2026-07-14',
          dispatchTimeZone,
          settingsUrl: 'https://voucha.ai/my/notification-settings',
          unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
          physicalAddress: 'Voucha, 123 Test St, Test City, CA 94000',
          communities: [],
        },
      ),
    ).resolves.toBeNull()
    await expect(hasModerationEmailSent(user!.id, trackingKey)).resolves.toBe(false)
    expect(ses.sendEmail).not.toHaveBeenCalled()
  })

  it('retries a summary after SES definitively rejects it before sending', async () => {
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user!.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: user!.id,
      role: 'owner',
      approvedById: user!.id,
    })
    const postId = await insertTestPost({
      title: 'Rate limited moderator post',
      slug: `rate-limited-moderator-post-${user!.id}`,
      createdById: user!.id,
      markdown: 'Needs review.',
      communityId: community.id,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: user!.id,
    })
    const { trackingKey, windowEnd, dispatchTimeZone } = await claimCurrentModerationSummaryForTest(
      user!.id,
    )
    const input = {
      emailAddress: 'tests+moderator@voucha.ai',
      userId: user!.id,
      trackingKey,
      windowEnd,
    }
    const variables = {
      generatedForDate: '2026-07-11',
      dispatchTimeZone,
      settingsUrl: 'https://voucha.ai/my/notification-settings',
      unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
      physicalAddress: 'Voucha, 123 Test St, Test City, CA 94000',
      communities: [],
    }
    const throttle = Object.assign(new Error('Maximum sending rate exceeded'), {
      name: 'MaxSendRateExceeded',
      $metadata: { httpStatusCode: 400 },
    })
    vi.mocked(ses.sendEmail).mockRejectedValueOnce(throttle)
    await expect(processSendCommunityModerationSummaryEmail(input, variables)).rejects.toBe(
      throttle,
    )
    await expect(
      processSendCommunityModerationSummaryEmail(input, variables),
    ).resolves.not.toBeNull()
    expect(ses.sendEmail).toHaveBeenCalledTimes(2)
  })
})

describe('moderation summary queued retention', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
  })

  it('skips a tracked job without its window end or after its claim horizon', async () => {
    const user = await createTestUser()
    const oldWindowEnd = '2020-01-01T12:00:00.000Z'
    const variables = {
      generatedForDate: '2020-01-01',
      dispatchTimeZone: 'UTC',
      settingsUrl: '/settings',
      communities: [],
    }
    await expect(
      processSendCommunityModerationSummaryEmail(
        { userId: user!.id, trackingKey: 'daily:2020-01-01' },
        variables,
      ),
    ).resolves.toBeNull()
    await expect(
      processSendCommunityModerationSummaryEmail(
        { userId: user!.id, trackingKey: 'daily:2020-01-01', windowEnd: oldWindowEnd },
        variables,
      ),
    ).resolves.toBeNull()
    expect(ses.sendEmail).not.toHaveBeenCalled()
  })
  it('keeps the queued local period after a timezone change and deduplicates replay', async () => {
    const user = await createTestUser()
    await updateUserFields(user!.id, { moderation_email_timezone: 'Pacific/Kiritimati' })
    const community = await insertTestCommunity({ createdById: user!.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: user!.id,
      role: 'owner',
      approvedById: user!.id,
    })
    const postId = await insertTestPost({
      title: 'Recomputed date moderator post',
      slug: `recomputed-date-moderator-post-${user!.id}`,
      createdById: user!.id,
      markdown: 'Needs review.',
      communityId: community.id,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: user!.id,
    })
    const queuedAt = new Date()
    const windowEnd = queuedAt.toISOString()
    const expectedDate = formatLocalDate(queuedAt, 'Pacific/Kiritimati')
    expect(expectedDate).not.toBe(formatLocalDate(queuedAt, 'Pacific/Honolulu'))
    const trackingKey = `daily:${expectedDate}`
    await claimModerationEmailSend(user!.id, trackingKey)
    const input = {
      emailAddress: 'tests+moderator@voucha.ai',
      userId: user!.id,
      trackingKey,
      windowStart: '2020-01-01T00:00:00.000Z',
      windowEnd,
    }
    const variables = {
      generatedForDate: '1900-01-01',
      dispatchTimeZone: 'Pacific/Kiritimati',
      settingsUrl: 'https://voucha.ai/my/notification-settings',
      unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
      physicalAddress: 'Voucha, 123 Test St, Test City, CA 94000',
      communities: [
        {
          name: 'Stale Queued Community',
          url: 'https://voucha.ai/communities/stale',
          pendingPostReviews: 1,
          pendingApplications: 0,
          pendingReports: 0,
          escalatedItems: 0,
          suspectedBanEvaders: 0,
          netMemberChange: 0,
          totalActiveMembers: 0,
          newDiscussionPosts: 0,
          newReviewPosts: 0,
          newDataPointPosts: 0,
          topDiscussionTitle: null,
          topDiscussionReplyCount: 0,
          activeMemberCount: 0,
          activeMemberRate: 0,
        },
      ],
    }
    await updateUserFields(user!.id, { moderation_email_timezone: 'Pacific/Honolulu' })
    await processSendCommunityModerationSummaryEmail(input, variables)

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: `Community moderation summary for ${expectedDate}`,
        text: expect.stringContaining(`summary for ${expectedDate}`),
        headers: expect.objectContaining({
          'List-Unsubscribe': expect.stringContaining('/api/v1/email-unsubscribe?token='),
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        }),
      }),
    )
    await expect(processSendCommunityModerationSummaryEmail(input, variables)).resolves.toBeNull()
    expect(ses.sendEmail).toHaveBeenCalledTimes(1)
  })
})
