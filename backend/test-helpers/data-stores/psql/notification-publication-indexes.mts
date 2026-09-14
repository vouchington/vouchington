import { read } from '@data-stores/psql'

export async function listNotificationPublicationIndexes(): Promise<
  Array<{ indexdef: string; indexname: string }>
> {
  const { rows } = await read<{
    indexdef: string
    indexname: string
  }>(`/* listNotificationPublicationIndexes */ SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'notifications'
      AND indexname IN ('idx_notifications__publication_post_id', 'idx_notifications__publication_rss_feed_item_id')
    ORDER BY indexname`)
  return rows
}

export async function getNotificationPushEndpointUpdateAction(): Promise<string | undefined> {
  const { rows } = await read<{ update_action: string }>(
    `/* getNotificationPushEndpointUpdateAction */ SELECT CASE constraint_record.confupdtype WHEN 'c' THEN 'CASCADE' ELSE constraint_record.confupdtype::text END AS update_action FROM pg_constraint constraint_record WHERE constraint_record.conrelid = 'notification_push_intent_subscription_receipts'::regclass AND constraint_record.contype = 'f' AND constraint_record.confrelid = 'notification_push_intents'::regclass`,
  )
  return rows[0]?.update_action
}
