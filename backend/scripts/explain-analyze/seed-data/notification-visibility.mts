import { beginTransaction, write } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const NOTIFICATION_VISIBILITY_SEED = {
  user: seedUuid(0, 'f7'),
  posts: [0, 1, 2].map(n => seedUuid(n, 'f8')),
  items: [0, 1].map(n => seedUuid(n, 'f9')),
  hostname: seedUuid(0, 'fa'),
  topic: seedUuid(0, 'fb'),
  url: seedUuid(0, 'fc'),
  feed: seedUuid(0, 'fd'),
  count: 2000,
}

/** Historical subscription pages and live manual sends share one owned recipient. */
export async function seedNotificationVisibility(): Promise<void> {
  await using q = await beginTransaction()
  await q(
    `/* seedNotificationVisibility:user */ INSERT INTO users(id,username)
    VALUES($1,'seed-notification-visibility')`,
    [NOTIFICATION_VISIBILITY_SEED.user],
  )
  await q(
    `/* seedNotificationVisibility:posts */
    INSERT INTO posts(id,created_by_id,post_type,title,markdown,created_via,approved_at,
      bedrock_nova_multimodal_v1_content_sha256,llm_moderation_content_sha256)
    SELECT id,$2,'discussion','Visibility seed','Visibility seed','system',
      CASE WHEN id=$3 THEN NULL ELSE CURRENT_TIMESTAMP END,
      decode(repeat('00',32),'hex'),decode(repeat('00',32),'hex')
    FROM UNNEST($1::uuid[]) id`,
    [
      NOTIFICATION_VISIBILITY_SEED.posts,
      NOTIFICATION_VISIBILITY_SEED.user,
      NOTIFICATION_VISIBILITY_SEED.posts[1],
    ],
  )
  await q(
    `/* seedNotificationVisibility:hostname */
    INSERT INTO url_hostnames(id,hostname) VALUES($1,'seed-notification-visibility.example.com')`,
    [NOTIFICATION_VISIBILITY_SEED.hostname],
  )
  await q(
    `/* seedNotificationVisibility:topic */
    INSERT INTO topics(id,name,slug,created_via,bedrock_nova_multimodal_v1_content_sha256)
    VALUES($1,'Visibility seed','seed-notification-visibility','system',decode(repeat('00',32),'hex'))`,
    [NOTIFICATION_VISIBILITY_SEED.topic],
  )
  await q(
    `/* seedNotificationVisibility:url */
    INSERT INTO urls(id,url,hostname_id,search_params)
    VALUES($1,'https://seed-notification-visibility.example.com/feed.xml',$2,'{}'::jsonb)`,
    [NOTIFICATION_VISIBILITY_SEED.url, NOTIFICATION_VISIBILITY_SEED.hostname],
  )
  await q(
    `/* seedNotificationVisibility:feed */
    INSERT INTO rss_feeds(id,rss_feed_url_id,topic_id,title,created_via)
    VALUES($1,$2,$3,'Visibility seed','system')`,
    [
      NOTIFICATION_VISIBILITY_SEED.feed,
      NOTIFICATION_VISIBILITY_SEED.url,
      NOTIFICATION_VISIBILITY_SEED.topic,
    ],
  )
  await q(
    `/* seedNotificationVisibility:settings */
    INSERT INTO rss_feed_setting_changes(change_type,rss_feed_id,is_enabled,reason)
    VALUES('enablement',$1,TRUE,'owned visibility fixture'),
      ('discoverability',$1,TRUE,'owned visibility fixture')`,
    [NOTIFICATION_VISIBILITY_SEED.feed],
  )
  await q(
    `/* seedNotificationVisibility:guids */
    INSERT INTO rss_feed_item_guids(id,url_hostname_id,guid)
    SELECT id,$2,'seed-notification-visibility-'||id::text FROM UNNEST($1::uuid[]) id`,
    [NOTIFICATION_VISIBILITY_SEED.items, NOTIFICATION_VISIBILITY_SEED.hostname],
  )
  await q(
    `/* seedNotificationVisibility:items */
    INSERT INTO rss_feed_items(id,url_id,data,deleted_at,bedrock_nova_multimodal_v1_content_sha256)
    SELECT id,$2,'{"title":"Visibility seed"}'::jsonb,
      CASE WHEN id=$3 THEN CURRENT_TIMESTAMP ELSE NULL END,decode(repeat('00',32),'hex')
    FROM UNNEST($1::uuid[]) id`,
    [
      NOTIFICATION_VISIBILITY_SEED.items,
      NOTIFICATION_VISIBILITY_SEED.url,
      NOTIFICATION_VISIBILITY_SEED.items[1],
    ],
  )
  await q(
    `/* seedNotificationVisibility:sources */
    INSERT INTO rss_feed_item_sources(rss_feed_id,rss_feed_item_id)
    SELECT $1,id FROM UNNEST($2::uuid[]) id`,
    [NOTIFICATION_VISIBILITY_SEED.feed, NOTIFICATION_VISIBILITY_SEED.items],
  )
  await q(
    `/* seedNotificationVisibility:notifications */
    INSERT INTO notifications(user_id,id,entity_type,post_id,rss_feed_item_id,delivery_type,sent_by_id,deleted_at,delete_reason,title,body,target_path)
    SELECT $1,('019e0000-fe00-7000-8000-'||lpad(to_hex(n),12,'0'))::uuid,
      CASE WHEN n<$2*3 THEN 'post'::notification_entity_types ELSE 'rss_feed_item' END,
      CASE WHEN n<$2 THEN $3::uuid WHEN n<$2*2 THEN $4::uuid WHEN n<$2*3 THEN $5::uuid END,
      CASE WHEN n>=$2*3 AND n<$2*4 THEN $6::uuid WHEN n>=$2*4 THEN $7::uuid END,
      CASE WHEN n<$2 OR (n>=$2*3 AND n<$2*4)
        THEN 'subscription'::notification_delivery_types ELSE 'manual_send' END,
      CASE WHEN n<$2 OR (n>=$2*3 AND n<$2*4) THEN NULL ELSE $1::uuid END,
      CASE WHEN n<$2 OR (n>=$2*3 AND n<$2*4) THEN CURRENT_TIMESTAMP ELSE NULL END,
      CASE WHEN n<$2 OR (n>=$2*3 AND n<$2*4) THEN 'system_pruned'::notification_delete_reasons ELSE NULL END,
      'Visibility seed','Visibility seed',
      CASE WHEN n<$2*3 THEN '/posts/seed-notification-visibility' ELSE '/rss-feed-items/seed-notification-visibility' END
    FROM generate_series(0,$2::int*5-1) n`,
    [
      NOTIFICATION_VISIBILITY_SEED.user,
      NOTIFICATION_VISIBILITY_SEED.count,
      ...NOTIFICATION_VISIBILITY_SEED.posts,
      ...NOTIFICATION_VISIBILITY_SEED.items,
    ],
  )
  await q.commit()
}

/** Restore only owned manual targets before the harness's rollback-isolated DML plan passes. */
export async function resetNotificationVisibilityContent(): Promise<void> {
  await write(
    `/* resetNotificationVisibilityContent */
    UPDATE notifications SET deleted_at=NULL,delete_reason=NULL
    WHERE user_id=$1 AND delivery_type='manual_send'
      AND (post_id=$2 OR rss_feed_item_id=$3)`,
    [
      NOTIFICATION_VISIBILITY_SEED.user,
      NOTIFICATION_VISIBILITY_SEED.posts[1],
      NOTIFICATION_VISIBILITY_SEED.items[1],
    ],
  )
}
