import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Creates the member-visible, non-sensitive projection of one legal delivery intent. */
export async function createCopyrightNoticeNotification(input: {
  statementCopy: { title: string; body: string }
  userId: string
  noticeId: string
  eventKey: string
  targetPath?: string
}): Promise<void> {
  const copy = input.statementCopy
  await write(sql`/* createCopyrightNoticeNotification */
    INSERT INTO notifications (
      user_id, entity_type, copyright_notice_id, event_key, delivery_type, title, body, target_path, target_intent
    ) SELECT
      ${input.userId}::uuid AS user_id, 'copyright_notice', ${input.noticeId}, ${input.eventKey}::text AS event_key, 'subscription',
      ${copy.title}, ${copy.body}, CASE WHEN ${input.targetPath ?? null}::text IS NOT NULL
        THEN ${input.targetPath ?? null}::text
        WHEN notice.accepted_at IS NOT NULL THEN ${`/copyright/notices/${input.noticeId}`} ELSE NULL END,
      (CASE WHEN notice.accepted_at IS NULL AND ${input.targetPath ?? null}::text IS NULL
        THEN 'notifications_inbox' ELSE NULL END)::notification_target_intents
    FROM copyright_notices notice WHERE notice.id = ${input.noticeId}
    ORDER BY user_id ASC NULLS LAST, event_key ASC NULLS LAST
    ON CONFLICT (user_id, event_key) WHERE event_key IS NOT NULL DO NOTHING
  `)
}
