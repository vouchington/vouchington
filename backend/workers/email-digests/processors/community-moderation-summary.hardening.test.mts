import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as ses from '@modules/aws/ses'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { insertTestPendingCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { claimModerationEmailSend } from '@services/communities/moderation-summary-emails'
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
    const trackingKey = 'daily:2026-07-11'
    await claimModerationEmailSend(user!.id, trackingKey)
    const input = { emailAddress: 'tests+moderator@voucha.ai', userId: user!.id, trackingKey }
    const variables = {
      generatedForDate: '2026-07-11',
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
