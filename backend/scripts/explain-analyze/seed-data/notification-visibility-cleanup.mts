import { beginTransaction } from '@data-stores/psql'
import { NOTIFICATION_VISIBILITY_SEED as s } from './notification-visibility.mts'

/** Delete only the fixture's reserved identities, including stale rows after an interrupted run. */
export async function cleanupNotificationVisibility(): Promise<void> {
  await using q = await beginTransaction()
  await q(
    `/* cleanupNotificationVisibility:notifications */ DELETE FROM notifications WHERE user_id=$1`,
    [s.user],
  )
  await q(
    `/* cleanupNotificationVisibility:sources */ DELETE FROM rss_feed_item_sources WHERE rss_feed_id=$1`,
    [s.feed],
  )
  await q(
    `/* cleanupNotificationVisibility:items */ DELETE FROM rss_feed_items WHERE id=ANY($1::uuid[])`,
    [s.items],
  )
  await q(
    `/* cleanupNotificationVisibility:guids */ DELETE FROM rss_feed_item_guids WHERE id=ANY($1::uuid[])`,
    [s.items],
  )
  await q(`/* cleanupNotificationVisibility:feed */ DELETE FROM rss_feeds WHERE id=$1`, [s.feed])
  await q(`/* cleanupNotificationVisibility:url */ DELETE FROM urls WHERE id=$1`, [s.url])
  await q(`/* cleanupNotificationVisibility:hostname */ DELETE FROM url_hostnames WHERE id=$1`, [
    s.hostname,
  ])
  await q(`/* cleanupNotificationVisibility:posts */ DELETE FROM posts WHERE id=ANY($1::uuid[])`, [
    s.posts,
  ])
  await q(`/* cleanupNotificationVisibility:topic */ DELETE FROM topics WHERE id=$1`, [s.topic])
  await q(`/* cleanupNotificationVisibility:user */ DELETE FROM users WHERE id=$1`, [s.user])
  await q(
    `/* cleanupNotificationVisibility:postIdentities */ DELETE FROM retained_post_identities WHERE id=ANY($1::uuid[])`,
    [s.posts],
  )
  await q(
    `/* cleanupNotificationVisibility:itemIdentities */ DELETE FROM retained_rss_feed_item_identities WHERE id=ANY($1::uuid[])`,
    [s.items],
  )
  await q(
    `/* cleanupNotificationVisibility:topicIdentity */ DELETE FROM retained_topic_identities WHERE id=$1`,
    [s.topic],
  )
  await q(
    `/* cleanupNotificationVisibility:userIdentity */ DELETE FROM retained_user_identities WHERE id=$1`,
    [s.user],
  )
  await q.commit()
}
