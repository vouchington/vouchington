import { write } from '@data-stores/psql'
import {
  buildNotificationPostRecipientEligibilityFilter,
  buildPublicPostEligibilityFilter,
} from '@modules/feed-query-builders'
import { itemHasDiscoverableSourceSql } from '@modules/feed-query-builders/discoverability-sql'
import sql from 'sql-template-strings'
import webpush from 'web-push'
import type { PushPayloadNotification } from './push-payload.mts'
import {
  notificationPushDeliveryPolicy,
  type NotificationPushDeliveryPolicy,
} from './push-intent-delivery-policy.mts'
import {
  runNotificationPushDelivery,
  type PushDeliveryDependencies,
} from './push-intent-delivery-runner.mts'
import { listPendingActivePushSubscriptions } from './push-intent-results.mts'
import {
  markNotificationPushIntentDelivered,
  markNotificationPushIntentSuppressed,
  releaseNotificationPushIntent,
  type NotificationPushIntent,
} from './push-intents.mts'

let isConfigured = false

type NotificationPushRow = PushPayloadNotification

function ensureWebPushConfig() {
  if (isConfigured) return true
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY
  const subject = process.env.WEB_PUSH_SUBJECT
  if (!publicKey || !privateKey || !subject) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  isConfigured = true
  return true
}

/** Rechecks a claimed intent against the live notification and target content before sending. */
export async function deliverClaimedNotificationPushIntent(
  intent: NotificationPushIntent,
  policy: NotificationPushDeliveryPolicy = notificationPushDeliveryPolicy,
  dependencies: PushDeliveryDependencies & {
    release?: typeof releaseNotificationPushIntent
    markDelivered?: typeof markNotificationPushIntentDelivered
  } = {},
): Promise<{
  delivered: number
  suppressed: boolean
}> {
  if (!ensureWebPushConfig()) {
    await releaseNotificationPushIntent(intent)
    return { delivered: 0, suppressed: false }
  }
  const notification = await getEligibleNotification(intent)
  if (!notification) {
    await markNotificationPushIntentSuppressed(intent)
    return { delivered: 0, suppressed: true }
  }
  const pending = await listPendingActivePushSubscriptions(intent)
  if (pending.length === 0) {
    await markNotificationPushIntentDelivered(intent)
    return { delivered: 0, suppressed: false }
  }
  const run = await runNotificationPushDelivery({
    intent,
    pending,
    notification,
    policy,
    dependencies,
  })
  if (run.fatalError) throw run.fatalError
  if (run.ownershipLost) return { delivered: 0, suppressed: false }
  const retryable =
    run.subscriptionStale || run.outcomes.some(result => result.kind === 'retryable_failure')
  const finalTransition = retryable
    ? (dependencies.release ?? releaseNotificationPushIntent)
    : (dependencies.markDelivered ?? markNotificationPushIntentDelivered)
  if (!(await finalTransition(intent))) return { delivered: 0, suppressed: false }
  if (retryable) {
    if (run.subscriptionStale) {
      throw new Error(
        `Web Push subscription generation changed during delivery for notification ${intent.notification_id}`,
      )
    }
    throw new Error(
      `Transient web push delivery failure for notification ${intent.notification_id}`,
    )
  }
  return {
    delivered: run.outcomes.filter(result => result.kind === 'delivered').length,
    suppressed: false,
  }
}

async function getEligibleNotification(
  intent: NotificationPushIntent,
): Promise<NotificationPushRow | undefined> {
  const query = sql`/* getEligibleNotificationPushIntent */
    SELECT n.id, n.entity_type, n.title, n.body, n.target_path, n.target_entity, n.target_intent,
      (SELECT c.slug FROM communities c WHERE c.id = n.community_id AND c.deleted_at IS NULL
        AND (c.visibility = 'public' OR EXISTS (SELECT 1 FROM community_members cm
          WHERE cm.community_id = c.id AND cm.user_id = n.user_id AND cm.removed_at IS NULL))) AS community_slug
    FROM notifications n
    LEFT JOIN posts candidate_post ON candidate_post.id = n.publication_post_id
    LEFT JOIN posts root_post ON root_post.id = COALESCE(candidate_post.root_id, candidate_post.id)
    WHERE n.user_id = ${intent.user_id} AND n.id = ${intent.notification_id} AND n.deleted_at IS NULL
      AND (n.entity_type <> 'post'
        OR (n.delivery_type <> 'manual_send'
          AND COALESCE(n.target_path, '') !~ '^/(posts|reviews|data-points|link|discussion|review|data-point)/')
        OR (candidate_post.id IS NOT NULL AND (
          (n.delivery_type = 'manual_send' AND `
  query
    .append(
      buildPublicPostEligibilityFilter('candidate_post', 'root_post', {
        includeRegisteredAudience: true,
      }),
    )
    .append(sql`) OR (n.delivery_type <> 'manual_send' AND `)
    .append(
      buildNotificationPostRecipientEligibilityFilter(
        'candidate_post',
        'root_post',
        intent.user_id,
      ),
    ).append(sql`))
          AND candidate_post.openai_omni_moderation_flagged IS NOT TRUE
          AND root_post.openai_omni_moderation_flagged IS NOT TRUE
        ))
      AND (n.entity_type <> 'rss_feed_item' OR (n.publication_rss_feed_item_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM rss_feed_items item WHERE item.id = n.publication_rss_feed_item_id
          AND item.deleted_at IS NULL AND `)
  query.append(itemHasDiscoverableSourceSql('item.id')).append(sql`
      )))`)
  const { rows } = await write<NotificationPushRow>(query)
  return rows[0]
}
