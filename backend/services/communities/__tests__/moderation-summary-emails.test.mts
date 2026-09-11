import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  clearTestUserModerationEmailTimezone,
  insertTestCommunity,
  insertTestCommunityMember,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { insertTestPendingCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { emails } from '@queues/emails/queues'
import { updateUserFields } from '@services/users/update-fields'
import {
  buildModerationSendKey,
  claimModerationEmailSend,
  dispatchCommunityModerationSummaryEmails,
  formatLocalDate,
  formatLocalTime,
  isModerationEmailDue,
  isModerationEmailsEnabled,
  releaseUnsentModerationEmailClaim,
  type ModerationRecipientRow,
} from '../moderation-summary-emails.mts'

describe('claimModerationEmailSend', () => {
  let userId: string

  beforeAll(async () => {
    const user = await createTestUser()
    userId = user!.id
  })

  it('deduplicates by user and send key', async () => {
    await expect(claimModerationEmailSend(userId, 'daily:2026-07-09')).resolves.toBe(true)
    await expect(claimModerationEmailSend(userId, 'daily:2026-07-09')).resolves.toBe(false)
    await expect(claimModerationEmailSend(userId, 'weekly:2026-W28')).resolves.toBe(true)
  })

  it('releases unsent claims so failed enqueues can retry', async () => {
    const user = await createTestUser()

    await expect(claimModerationEmailSend(user!.id, 'daily:2026-07-15')).resolves.toBe(true)
    await expect(releaseUnsentModerationEmailClaim(user!.id, 'daily:2026-07-15')).resolves.toBe(
      true,
    )
    await expect(claimModerationEmailSend(user!.id, 'daily:2026-07-15')).resolves.toBe(true)
  })

  it('reports moderation emails disabled for an unknown user', async () => {
    await expect(isModerationEmailsEnabled('00000000-0000-0000-0000-000000000000')).resolves.toBe(
      false,
    )
  })

  it('dispatches a summary email for due community moderators', async () => {
    const user = await createTestUser()
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
    const postId = await insertTestPost({
      title: 'Pending moderation post',
      slug: `pending-moderation-post-${user!.id}`,
      createdById: user!.id,
      markdown: 'Needs review.',
      communityId: community.id,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: user!.id,
    })

    await dispatchCommunityModerationSummaryEmails()

    await expect(
      claimModerationEmailSend(
        user!.id,
        buildModerationSendKey(
          {
            id: user!.id,
            email_address: 'tests+moderator@voucha.ai',
            username: null,
            ui_locale: null,
            moderation_email_cadence: 'daily',
            moderation_email_days_of_week: [1, 2, 3, 4, 5, 6, 7],
            moderation_email_time_of_day: moderationEmailTime,
            moderation_email_timezone: 'UTC',
          },
          new Date(),
        ),
      ),
    ).resolves.toBe(false)
  })

  it('falls back to Los Angeles when moderation email timezone is unset', async () => {
    const user = await createTestUser()
    await clearTestUserModerationEmailTimezone(user!.id)
    const moderationEmailTime = formatLocalTime(new Date(), 'America/Los_Angeles')
    await updateUserFields(user!.id, {
      moderation_emails_enabled: true,
      moderation_email_cadence: 'daily',
      moderation_email_days_of_week: [1, 2, 3, 4, 5, 6, 7],
      moderation_email_time_of_day: moderationEmailTime,
    })
    const community = await insertTestCommunity({ createdById: user!.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: user!.id,
      role: 'owner',
      approvedById: user!.id,
    })
    const postId = await insertTestPost({
      title: 'Pending moderation post timezone fallback',
      slug: `pending-moderation-post-timezone-fallback-${user!.id}`,
      createdById: user!.id,
      markdown: 'Needs review.',
      communityId: community.id,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: user!.id,
    })

    await dispatchCommunityModerationSummaryEmails()

    await expect(
      claimModerationEmailSend(
        user!.id,
        buildModerationSendKey(
          {
            id: user!.id,
            email_address: 'tests+moderator@voucha.ai',
            username: null,
            ui_locale: null,
            moderation_email_cadence: 'daily',
            moderation_email_days_of_week: [1, 2, 3, 4, 5, 6, 7],
            moderation_email_time_of_day: moderationEmailTime,
            moderation_email_timezone: 'America/Los_Angeles',
          },
          new Date(),
        ),
      ),
    ).resolves.toBe(false)
  })

  it('does not enqueue summaries for quiet communities', async () => {
    const user = await createTestUser()
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
})

describe('moderation summary scheduling', () => {
  const now = new Date('2026-07-09T15:30:00.000Z')
  const recipient: ModerationRecipientRow = {
    id: 'user-1',
    email_address: 'tests+moderator@voucha.ai',
    username: 'moderator',
    ui_locale: 'en',
    moderation_email_cadence: 'daily',
    moderation_email_days_of_week: [2, 4],
    moderation_email_time_of_day: '08:30',
    moderation_email_timezone: 'America/Los_Angeles',
  }

  it('formats the recipient-local date and time', () => {
    expect(formatLocalDate(now, 'America/Los_Angeles')).toBe('2026-07-09')
    expect(formatLocalTime(now, 'America/Los_Angeles')).toBe('08:30')
  })

  it('requires the configured local time', () => {
    expect(isModerationEmailDue(recipient, now)).toBe(true)
    expect(
      isModerationEmailDue(
        {
          ...recipient,
          moderation_email_time_of_day: '08:29',
        },
        now,
      ),
    ).toBe(true)
    expect(
      isModerationEmailDue(
        {
          ...recipient,
          moderation_email_time_of_day: '08:31',
        },
        now,
      ),
    ).toBe(false)
  })

  it('checks selected days and weekly cadence against ISO day values', () => {
    expect(
      isModerationEmailDue(
        {
          ...recipient,
          moderation_email_cadence: 'selected_days',
          moderation_email_days_of_week: [4],
        },
        now,
      ),
    ).toBe(true)
    expect(
      isModerationEmailDue(
        {
          ...recipient,
          moderation_email_cadence: 'selected_days',
          moderation_email_days_of_week: [5],
        },
        now,
      ),
    ).toBe(false)
    expect(
      isModerationEmailDue(
        {
          ...recipient,
          moderation_email_cadence: 'weekly',
          moderation_email_days_of_week: [4, 6],
        },
        now,
      ),
    ).toBe(true)
  })

  it('builds daily and weekly send keys from the recipient-local date', () => {
    expect(buildModerationSendKey(recipient, now)).toBe('daily:2026-07-09')
    expect(
      buildModerationSendKey(
        {
          ...recipient,
          moderation_email_cadence: 'weekly',
        },
        now,
      ),
    ).toBe('weekly:2026-W28')
  })
})
