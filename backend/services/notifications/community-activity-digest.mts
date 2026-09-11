import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getMinUUIDv7ForDate } from '@modules/utils'
import {
  COMMUNITY_ACTIVITY_DIGEST_RECIPIENT_BATCH_SIZE,
  getPreviousClosedMondayWindow,
  listCommunityActivityDigestRecipientPage,
} from './community-activity-digest-recipients.mts'
import { buildCommunityActivityDigestBody } from './community-activity-digest-body.mts'
import { aggregateCommunityActivityDigestBatch } from './community-activity-digest-aggregation.mts'
import { ensureNotificationPushIntents } from './ensure-push-intents.mts'

export { getPreviousClosedMondayWindow }

export async function createCommunityActivityDigestBatch(input: {
  windowStart: Date
  windowEnd: Date
  afterUserId?: string
}): Promise<{
  created: Array<{ userId: string; notificationId: string }>
  nextUserId: string | null
}> {
  const { rows: recipientRows, page } = await listCommunityActivityDigestRecipientPage(
    input.afterUserId,
  )
  if (page.length === 0) return { created: [], nextUserId: null }
  const digestRows = await aggregateCommunityActivityDigestBatch({
    recipientIds: page.map(row => row.user_id),
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    windowStartId: getMinUUIDv7ForDate(input.windowStart),
    windowEndId: getMinUUIDv7ForDate(input.windowEnd),
  })
  const eventKey = `community-activity-digest:${input.windowStart.toISOString()}`
  const inserts = digestRows.map(row => ({
    userId: row.user_id,
    body: buildCommunityActivityDigestBody(row),
    eventKey,
  }))
  const { rows } = await write<{ user_id: string; id: string }>(sql`
    /* insertCommunityActivityDigestBatch */
    WITH input AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(inserts)}::jsonb)
        AS x("userId" uuid, body text, "eventKey" text)
    ), inserted AS (
      INSERT INTO notifications (user_id, entity_type, event_key, title, body, target_intent)
      SELECT "userId", 'community_activity_digest', "eventKey",
        'Your weekly community activity', body, 'notifications_inbox'
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
  return {
    created,
    nextUserId:
      recipientRows.length > COMMUNITY_ACTIVITY_DIGEST_RECIPIENT_BATCH_SIZE
        ? (page.at(-1)?.user_id ?? null)
        : null,
  }
}
