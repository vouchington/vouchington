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
import { EMAIL_DIGESTS_SEND_MODERATION_SUMMARY_JOB } from '@queues/background/enqueues/email-digests-jobs'
import { backgroundQueue as emailDigests } from '@voucha/test-helpers/shared-background-queue'
import { updateUserFields } from '@services/users/update-fields'
import {
  claimModerationEmailSend,
  dispatchCommunityModerationSummaryEmails,
  formatLocalDate,
  getModerationSummaryRecipients,
  isModerationEmailDue,
  isModerationEmailsEnabled,
  getModerationSummaryRecipients,
  releaseUnsentModerationEmailClaim,
} from '../moderation-summary-emails.mts'

type ModerationRecipientRow = Awaited<ReturnType<typeof getModerationSummaryRecipients>>[number]

function pinnedNow(): Date {
  return new Date(process.env.VOUCH_PROOF_NOW ?? '2026-10-31T12:00:00.000Z')
}

async function findQueuedModerationSummary(userId: string) {
  const jobs = await readAllQueueJobs(emailDigests)
  return jobs.find(job => {
    const data = job.data as { input?: { userId?: string } }
    return (
      job.name === EMAIL_DIGESTS_SEND_MODERATION_SUMMARY_JOB.name && data.input?.userId === userId
    )
  })
}

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
    const now = pinnedNow()
    const moderationEmailTime = now.toISOString().slice(11, 16)
    await updateUserFields(user!.id, {
      is_moderation_emails_enabled: true,
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

    await dispatchCommunityModerationSummaryEmails(now)

    const queuedSummary = await findQueuedModerationSummary(user!.id)
    expect(queuedSummary?.data).toMatchObject({
      input: { trackingKey: `daily:${now.toISOString().slice(0, 10)}` },
      variables: { dispatchTimeZone: 'UTC' },
    })

    await expect(
      claimModerationEmailSend(user!.id, `daily:${now.toISOString().slice(0, 10)}`),
    ).resolves.toBe(false)
  })

  it.each([
    ['summer', '2027-07-08T15:30:00.000Z', '2027-07-08'],
    ['winter', '2026-12-10T16:30:00.000Z', '2026-12-10'],
  ])('falls back to Los Angeles local time during %s', async (_season, timestamp, localDate) => {
    const user = await createTestUser()
    const now = new Date(timestamp)
    await clearTestUserModerationEmailTimezone(user!.id)
    await updateUserFields(user!.id, {
      is_moderation_emails_enabled: true,
      moderation_email_cadence: 'daily',
      moderation_email_days_of_week: [1, 2, 3, 4, 5, 6, 7],
      moderation_email_time_of_day: '08:30',
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

    await dispatchCommunityModerationSummaryEmails(now)

    const queuedSummary = await findQueuedModerationSummary(user!.id)
    expect(queuedSummary?.data).toMatchObject({
      input: { trackingKey: `daily:${localDate}` },
      variables: { dispatchTimeZone: 'America/Los_Angeles', generatedForDate: localDate },
    })

    await expect(claimModerationEmailSend(user!.id, `daily:${localDate}`)).resolves.toBe(false)
  })

  it('uses the ISO week year in a queued weekly tracking key', async () => {
    const user = await createTestUser()
    const now = new Date('2027-01-01T10:30:00.000Z')
    await updateUserFields(user!.id, {
      is_moderation_emails_enabled: true,
      moderation_email_cadence: 'weekly',
      moderation_email_days_of_week: [5],
      moderation_email_time_of_day: '10:30',
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
      title: 'Pending weekly moderation post',
      slug: `pending-weekly-moderation-post-${user!.id}`,
      createdById: user!.id,
      markdown: 'Needs review.',
      communityId: community.id,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: user!.id,
    })

    await dispatchCommunityModerationSummaryEmails(now)

    const queuedSummary = await findQueuedModerationSummary(user!.id)
    expect(queuedSummary?.data).toMatchObject({
      input: { trackingKey: 'weekly:2026-W53' },
      variables: { dispatchTimeZone: 'UTC', generatedForDate: '2027-01-01' },
    })
  })

  it('does not enqueue summaries for quiet communities', async () => {
    const user = await createTestUser()
    const now = pinnedNow()
    const moderationEmailTime = now.toISOString().slice(11, 16)
    await updateUserFields(user!.id, {
      is_moderation_emails_enabled: true,
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

    await dispatchCommunityModerationSummaryEmails(now)

    expect(await findQueuedModerationSummary(user!.id)).toBeUndefined()
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
})
