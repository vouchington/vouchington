import { read } from '../data-stores/psql/index.mts'
import sql from 'sql-template-strings'
import { createTestUser } from './entities/users.mts'
import { insertTestCommunity } from './entities/communities.mts'
import {
  insertTestCommunityMember,
  setTestCommunityDigestVacationSuppression,
} from './entities/community-members.mts'
import { insertTestPendingCommunityPostReview } from './entities/community-post-reviews.mts'
import { insertTestPost } from './entities/posts.mts'
import { insertTestCommunityVacation } from './entities/community-member-vacations.mts'
import {
  claimModerationEmailSend,
  formatLocalDate,
  getIsoWeekKey,
} from '../services/communities/moderation-summary-emails.mts'

async function getTestModerationEmailTimezone(userId: string): Promise<string> {
  const { rows } = await read<{ moderation_email_timezone: string }>(
    sql`/* getTestModerationEmailTimezone */
      SELECT COALESCE(moderation_email_timezone, 'America/Los_Angeles') AS moderation_email_timezone
      FROM view_users_private
      WHERE id = ${userId}
      LIMIT 1`,
  )
  return rows[0]?.moderation_email_timezone ?? 'America/Los_Angeles'
}

export async function claimCurrentModerationSummaryForTest(userId: string): Promise<{
  trackingKey: string
  windowEnd: string
  dispatchTimeZone: string
}> {
  const now = new Date()
  const timeZone = await getTestModerationEmailTimezone(userId)
  const trackingKey = `daily:${formatLocalDate(now, timeZone)}`
  await claimModerationEmailSend(userId, trackingKey)
  return { trackingKey, windowEnd: now.toISOString(), dispatchTimeZone: timeZone }
}

export async function createClockSkewModerationSummaryFixture(
  queuedWindowEnd: Date,
  options: { cadence: 'daily' | 'weekly'; excludeActivity: boolean; vacationBoundary: boolean },
): Promise<{ userId: string; trackingKey: string; queuedDate: string }> {
  const user = await createTestUser()
  const community = await insertTestCommunity({ createdById: user.id })
  await insertTestCommunityMember({
    communityId: community.id,
    userId: user.id,
    role: 'owner',
    approvedById: user.id,
  })
  if (options.vacationBoundary) {
    const vacationEndsAt = new Date(queuedWindowEnd.getTime() - 500)
    await setTestCommunityDigestVacationSuppression(community.id, user.id, true)
    await insertTestCommunityVacation({
      communityId: community.id,
      userId: user.id,
      startsAt: new Date(vacationEndsAt.getTime() - 60 * 60 * 1000).toISOString(),
      endsAt: vacationEndsAt.toISOString(),
    })
  }
  const postId = await insertTestPost({
    title: 'Clock skew moderation activity',
    slug: `clock-skew-moderation-${user.id}`,
    createdById: user.id,
    markdown: 'Needs review.',
    communityId: community.id,
    createdAt: options.excludeActivity
      ? new Date(queuedWindowEnd.getTime() - 1)
      : new Date('2020-01-01T00:00:00.000Z'),
  })
  await insertTestPendingCommunityPostReview({
    communityId: community.id,
    postId,
    submittedById: user.id,
  })
  const queuedDate = formatLocalDate(queuedWindowEnd, 'UTC')
  const trackingKey =
    options.cadence === 'weekly' ? `weekly:${getIsoWeekKey(queuedDate)}` : `daily:${queuedDate}`
  return { userId: user.id, trackingKey, queuedDate }
}
