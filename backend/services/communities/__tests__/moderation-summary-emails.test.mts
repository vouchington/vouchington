import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  clearTestUserModerationEmailTimezone,
  insertTestCommunity,
  insertTestCommunityMember,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { claimTestModerationEmailSend } from '@voucha/test-helpers/moderation-summary-retention'
import { insertTestPendingCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { EMAIL_DIGESTS_SEND_MODERATION_SUMMARY_JOB } from '@queues/background/enqueues/email-digests-jobs'
import { backgroundQueue as emailDigests } from '@voucha/test-helpers/shared-background-queue'
import { updateUserFields } from '@services/users/update-fields'
import {
  dispatchCommunityModerationSummaryEmails,
  formatLocalDate,
  isModerationEmailsEnabled,
  releaseUnsentModerationEmailClaim,
} from '../moderation-summary-emails.mts'

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

describe('moderation summary dispatch', () => {
  let userId: string

  beforeAll(async () => {
    const user = await createTestUser()
    userId = user!.id
  })

  it('does not enqueue a summary for a window that is already claimed', async () => {
    const user = await createTestUser()
    const now = pinnedNow()
    await seedDueModerator(user!.id, {
      time: now.toISOString().slice(11, 16),
      timeZone: 'UTC',
      cadence: 'daily',
      days: [1, 2, 3, 4, 5, 6, 7],
    })
    const sendKey = `daily:${now.toISOString().slice(0, 10)}`
    await expect(claimTestModerationEmailSend(user!.id, sendKey)).resolves.toBe(true)

    await dispatchCommunityModerationSummaryEmails(now)

    expect(await findQueuedModerationSummary(user!.id)).toBeUndefined()
  })

  it('claims daily and weekly windows independently', async () => {
    const user = await createTestUser()
    const now = new Date('2027-01-01T10:30:00.000Z')
    await seedDueModerator(user!.id, {
      time: '10:30',
      timeZone: 'UTC',
      cadence: 'weekly',
      days: [5],
    })
    await expect(claimTestModerationEmailSend(user!.id, 'daily:2027-01-01')).resolves.toBe(true)

    await dispatchCommunityModerationSummaryEmails(now)

    expect((await findQueuedModerationSummary(user!.id))?.data).toMatchObject({
      input: { trackingKey: 'weekly:2026-W53' },
    })
  })

  it('releases unsent claims so failed enqueues can retry', async () => {
    const user = await createTestUser()

    await expect(claimTestModerationEmailSend(user!.id, 'daily:2026-07-15')).resolves.toBe(true)
    await expect(releaseUnsentModerationEmailClaim(user!.id, 'daily:2026-07-15')).resolves.toBe(
      true,
    )
    await expect(claimTestModerationEmailSend(user!.id, 'daily:2026-07-15')).resolves.toBe(true)
  })

  it('reports moderation emails disabled for an unknown user', async () => {
    await expect(isModerationEmailsEnabled('00000000-0000-0000-0000-000000000000')).resolves.toBe(
      false,
    )
  })

  it('dispatches a summary email for due community moderators', async () => {
    const user = await createTestUser()
    const now = pinnedNow()
    await seedDueModerator(user!.id, {
      time: now.toISOString().slice(11, 16),
      timeZone: 'UTC',
      cadence: 'daily',
      days: [1, 2, 3, 4, 5, 6, 7],
    })

    await dispatchCommunityModerationSummaryEmails(now)

    const queuedSummary = await findQueuedModerationSummary(user!.id)
    expect(queuedSummary?.data).toMatchObject({
      input: { trackingKey: `daily:${now.toISOString().slice(0, 10)}` },
      variables: { dispatchTimeZone: 'UTC' },
    })

    await expect(
      claimTestModerationEmailSend(user!.id, `daily:${now.toISOString().slice(0, 10)}`),
    ).resolves.toBe(false)
  })

  it.each([
    ['summer', '2027-07-08T15:30:00.000Z', '2027-07-08'],
    ['winter', '2026-12-10T16:30:00.000Z', '2026-12-10'],
  ])('falls back to Los Angeles local time during %s', async (_season, timestamp, localDate) => {
    const user = await createTestUser()
    const now = new Date(timestamp)
    await clearTestUserModerationEmailTimezone(user!.id)
    await seedDueModerator(user!.id, {
      time: '08:30',
      cadence: 'daily',
      days: [1, 2, 3, 4, 5, 6, 7],
    })

    await dispatchCommunityModerationSummaryEmails(now)

    const queuedSummary = await findQueuedModerationSummary(user!.id)
    expect(queuedSummary?.data).toMatchObject({
      input: { trackingKey: `daily:${localDate}` },
      variables: { dispatchTimeZone: 'America/Los_Angeles', generatedForDate: localDate },
    })

    await expect(claimTestModerationEmailSend(user!.id, `daily:${localDate}`)).resolves.toBe(false)
  })

  it('uses the ISO week year in a queued weekly tracking key', async () => {
    const user = await createTestUser()
    const now = new Date('2027-01-01T10:30:00.000Z')
    await seedDueModerator(user!.id, {
      time: '10:30',
      timeZone: 'UTC',
      cadence: 'weekly',
      days: [5],
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
    await seedDueModerator(user!.id, {
      time: now.toISOString().slice(11, 16),
      timeZone: 'UTC',
      cadence: 'daily',
      days: [1, 2, 3, 4, 5, 6, 7],
      pendingReview: false,
    })

    await dispatchCommunityModerationSummaryEmails(now)

    expect(await findQueuedModerationSummary(user!.id)).toBeUndefined()
  })
})

describe('moderation summary scheduling', () => {
  const now = new Date('2026-07-09T15:30:00.000Z')
  const due = { time: '08:30', timeZone: 'America/Los_Angeles', cadence: 'daily' as const }

  async function isQueuedFor(settings: Parameters<typeof seedDueModerator>[1]): Promise<boolean> {
    const user = await createTestUser()
    await seedDueModerator(user!.id, settings)
    await dispatchCommunityModerationSummaryEmails(now)
    return (await findQueuedModerationSummary(user!.id)) !== undefined
  }

  it('formats the recipient-local date and time', () => {
    expect(formatLocalDate(now, 'America/Los_Angeles')).toBe('2026-07-09')
  })

  it('requires the configured local time', async () => {
    expect(await isQueuedFor({ ...due, days: [2, 4] })).toBe(true)
    expect(await isQueuedFor({ ...due, time: '08:29', days: [2, 4] })).toBe(true)
    expect(await isQueuedFor({ ...due, time: '08:31', days: [2, 4] })).toBe(false)
  })

  it('checks selected days and weekly cadence against ISO day values', async () => {
    expect(await isQueuedFor({ ...due, cadence: 'selected_days', days: [4] })).toBe(true)
    expect(await isQueuedFor({ ...due, cadence: 'selected_days', days: [5] })).toBe(false)
    expect(await isQueuedFor({ ...due, cadence: 'weekly', days: [4, 6] })).toBe(true)
  })
})

async function seedDueModerator(
  userId: string,
  settings: {
    time: string
    timeZone?: string
    cadence: 'daily' | 'weekly' | 'selected_days'
    days: number[]
    pendingReview?: boolean
  },
): Promise<void> {
  await updateUserFields(userId, {
    is_moderation_emails_enabled: true,
    moderation_email_cadence: settings.cadence,
    moderation_email_days_of_week: settings.days,
    moderation_email_time_of_day: settings.time,
    ...(settings.timeZone && { moderation_email_timezone: settings.timeZone }),
  })
  const community = await insertTestCommunity({ createdById: userId })
  await insertTestCommunityMember({
    communityId: community.id,
    userId,
    role: 'owner',
    approvedById: userId,
  })
  if (settings.pendingReview === false) return
  const postId = await insertTestPost({
    title: 'Pending moderation post',
    slug: `pending-moderation-post-${userId}`,
    createdById: userId,
    markdown: 'Needs review.',
    communityId: community.id,
  })
  await insertTestPendingCommunityPostReview({
    communityId: community.id,
    postId,
    submittedById: userId,
  })
}
