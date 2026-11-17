import { getNotificationsWorkLimit } from './work-limits.mts'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getMinUuidv7ForDate } from '@modules/utils'
import { listCommunityActivityDigestRecipientPage } from './community-activity-digest-recipients.mts'
import { aggregateCommunityActivityDigestBatch } from './community-activity-digest-aggregation.mts'
import { ensureNotificationPushIntents } from './ensure-push-intents.mts'

export async function createCommunityActivityDigestBatch(input: {
  windowStart: Date
  windowEnd: Date
  afterUserId?: string
  afterCommunityId?: string | null
  throughUserId?: string
  now?: Date
  userIds?: readonly string[]
  batchSize?: number
}): Promise<{
  created: Array<{ userId: string; notificationId: string }>
  nextUserId: string | null
  nextCommunityId: string | null
}> {
  const batchSize =
    input.batchSize ?? getNotificationsWorkLimit('community_digest_recipient_batch_size')
  const { page, nextUserId, nextCommunityId } = await listCommunityActivityDigestRecipientPage(
    input.afterUserId,
    input.throughUserId,
    input.userIds,
    batchSize,
    input.afterCommunityId,
  )
  if (page.length === 0) return { created: [], nextUserId, nextCommunityId }
  const digestRows = await aggregateCommunityActivityDigestBatch({
    recipientIds: page.map(row => row.user_id),
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    now: input.now ?? new Date(),
    windowStartId: getMinUuidv7ForDate(input.windowStart),
    windowEndId: getMinUuidv7ForDate(input.windowEnd),
  })
  const eventKey = `community-activity-digest:${input.windowStart.toISOString()}`
  const inserts = digestRows.map(({ user_id: userId, top_post_id: topPostId, ...params }) => ({
    userId,
    topPostId,
    params: topPostId ? params : { ...params, top_discussion_replies: undefined },
    eventKey,
  }))
  const { rows } = await write<{ user_id: string; id: string }>(sql`
    /* insertCommunityActivityDigestBatch */
    WITH input AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(inserts)}::jsonb)
        AS x("userId" uuid, "topPostId" uuid, params jsonb, "eventKey" text)
    ), inserted AS (
      INSERT INTO notifications (user_id, entity_type, kind, event_key, top_post_id, params, target_intent)
      SELECT "userId", 'community_activity_digest', 'community_activity_digest', "eventKey",
        "topPostId", params, 'notifications_inbox'
      FROM input ORDER BY "userId", "eventKey"
      ON CONFLICT (user_id, event_key) WHERE event_key IS NOT NULL DO NOTHING RETURNING user_id, id
    )
    SELECT user_id, id FROM inserted UNION ALL
    SELECT n.user_id, n.id FROM notifications n JOIN input i ON i."userId" = n.user_id
    WHERE n.entity_type = 'community_activity_digest' AND n.event_key = ${eventKey}
      AND n.deleted_at IS NULL AND n.pushed_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM inserted x WHERE x.id = n.id)
  `)
  const created = rows.map(row => ({ userId: row.user_id, notificationId: row.id }))
  await ensureNotificationPushIntents(created)
  return { created, nextUserId, nextCommunityId }
}
