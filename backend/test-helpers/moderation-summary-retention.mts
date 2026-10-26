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
  activityAt: string | null,
  vacationBoundary: boolean,
): Promise<string> {
  const user = await createTestUser()
  const community = await insertTestCommunity({ createdById: user.id })
  await insertTestCommunityMember({
    communityId: community.id,
    userId: user.id,
    role: 'owner',
    approvedById: user.id,
  })
  if (vacationBoundary) {
    await setTestCommunityDigestVacationSuppression(community.id, user.id, true)
    await insertTestCommunityVacation({
      communityId: community.id,
      userId: user.id,
      startsAt: '2030-01-06T23:00:00.000Z',
      endsAt: '2030-01-07T00:00:00.000Z',
    })
  }
  const postId = await insertTestPost({
    title: 'Clock skew moderation activity',
    slug: `clock-skew-moderation-${user.id}`,
    createdById: user.id,
    markdown: 'Needs review.',
    communityId: community.id,
    createdAt: new Date(activityAt ?? '2020-01-01T00:00:00.000Z'),
  })
  await insertTestPendingCommunityPostReview({
    communityId: community.id,
    postId,
    submittedById: user.id,
  })
  return user.id
}
