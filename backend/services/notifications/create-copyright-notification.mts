import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Creates the member-visible, non-sensitive projection of one legal delivery intent. */
export async function createCopyrightNoticeNotification(input: {
  kind: `copyright_${string}`
  aiAssisted: boolean
  userId: string
  noticeId: string
  intentId: string
  eventKey: string
  targetPath?: string
}): Promise<void> {
  await write(sql`/* createCopyrightNoticeNotification */
    INSERT INTO notifications (
      user_id, entity_type, kind, params, copyright_notice_id, copyright_notice_delivery_work_item_id,
      event_key, delivery_type, target_path, target_intent
    ) SELECT
      ${input.userId}::uuid AS user_id, 'copyright_notice', ${input.kind}::notification_kinds,
      ${JSON.stringify(input.aiAssisted ? { ai_assisted: true } : {})}::jsonb,
      ${input.noticeId}, ${input.intentId}::uuid, ${input.eventKey}::text AS event_key, 'subscription',
      CASE WHEN ${input.targetPath ?? null}::text IS NOT NULL
        THEN ${input.targetPath ?? null}::text
        WHEN notice.accepted_at IS NOT NULL THEN ${`/copyright/notices/${input.noticeId}`} ELSE NULL END,
      (CASE WHEN notice.accepted_at IS NULL AND ${input.targetPath ?? null}::text IS NULL
        THEN 'notifications_inbox' ELSE NULL END)::notification_target_intents
    FROM copyright_notices notice WHERE notice.id = ${input.noticeId}
    ORDER BY user_id ASC NULLS LAST, event_key ASC NULLS LAST
    ON CONFLICT (user_id, event_key) WHERE event_key IS NOT NULL DO NOTHING
  `)
}
