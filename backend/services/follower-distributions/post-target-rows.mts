import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  assertDistributablePost,
  getPostRouteSlug,
  getPostSendTitle,
  truncateText,
  type DistributionPost,
} from './shared.mts'
import type { DistributionRow, ProcessTargetRowsResult } from './process-types.mts'
import { getUnpushedNotificationsForDeliveries, markDistributionFailed } from './process-state.mts'

export async function insertPostFeedShares(
  distribution: DistributionRow,
  recipientIds: string[],
  query: TransactionQuery,
): Promise<boolean> {
  const post = await getDistributionPost(distribution.post_id!, query)
  if (!post) {
    await markDistributionFailed(distribution.id, 'Post not found', query)
    return false
  }
  try {
    assertDistributablePost(post, distribution.sender_user_id, 'share')
  } catch (error) {
    await markDistributionFailed(
      distribution.id,
      error instanceof Error ? error.message : 'Post is no longer distributable',
      query,
    )
    return false
  }

  await query(sql`/* insertPostFeedShares */
    INSERT INTO post_feed_shares (
      recipient_user_id,
      id,
      shared_by_user_id,
      post_id,
      sort_at
    )
    SELECT
      deliveries.recipient_user_id,
      deliveries.delivery_id,
      ${distribution.sender_user_id},
      ${distribution.post_id},
      GREATEST(uuid_extract_timestamp(deliveries.delivery_id), ${post.created_at}::timestamptz)
    FROM follower_distribution_deliveries deliveries
    WHERE deliveries.distribution_id = ${distribution.id}
      AND deliveries.recipient_user_id = ANY(${recipientIds}::uuid[])
    ORDER BY deliveries.recipient_user_id, deliveries.delivery_id
    ON CONFLICT (recipient_user_id, id) DO NOTHING
  `)
  return true
}

export async function insertPostManualSendNotifications(
  distribution: DistributionRow,
  recipientIds: string[],
  query: TransactionQuery,
): Promise<ProcessTargetRowsResult> {
  const post = await getDistributionPost(distribution.post_id!, query)
  if (!post) {
    await markDistributionFailed(distribution.id, 'Post not found', query)
    return { failed: true, notificationsToDeliver: [] }
  }
  try {
    assertDistributablePost(post, distribution.sender_user_id, 'send')
  } catch (error) {
    await markDistributionFailed(
      distribution.id,
      error instanceof Error ? error.message : 'Post is no longer distributable',
      query,
    )
    return { failed: true, notificationsToDeliver: [] }
  }

  const routePath = `/${getPostRouteSlug(post.post_type)}/${post.slug ?? post.id}`
  const title = getPostSendTitle(distribution.sender_username, post.post_type)
  const body = truncateText(post.title || post.markdown, 180)

  await query(sql`/* insertPostManualSendNotifications */
    INSERT INTO notifications (
      user_id,
      id,
      entity_type,
      delivery_type,
      sent_by_user_id,
      post_id,
      title,
      body,
      actor_label,
      target_path
    )
    SELECT
      deliveries.recipient_user_id,
      deliveries.delivery_id,
      'post',
      'manual_send',
      ${distribution.sender_user_id},
      ${post.id},
      ${title},
      ${body},
      ${distribution.sender_username},
      ${routePath}
    FROM follower_distribution_deliveries deliveries
    WHERE deliveries.distribution_id = ${distribution.id}
      AND deliveries.recipient_user_id = ANY(${recipientIds}::uuid[])
    ORDER BY deliveries.recipient_user_id, deliveries.delivery_id
    ON CONFLICT (user_id, id) DO NOTHING
  `)

  return {
    failed: false,
    notificationsToDeliver: await getUnpushedNotificationsForDeliveries(
      distribution.id,
      recipientIds,
      query,
    ),
  }
}

async function getDistributionPost(
  postId: string,
  query: TransactionQuery,
): Promise<DistributionPost | null> {
  const { rows } = await query(sql`/* getDistributionPost */
    SELECT
      id,
      created_at,
      created_by_id,
      post_type,
      privacy,
      broadcast,
      (
        SELECT slug
        FROM post_slugs
        WHERE post_id = posts.id
        ORDER BY post_slugs.created_at DESC
        LIMIT 1
      ) AS slug,
      title,
      markdown
    FROM posts
    WHERE id = ${postId}
      AND deleted_at IS NULL
  `)
  return (rows[0] as DistributionPost | undefined) ?? null
}
