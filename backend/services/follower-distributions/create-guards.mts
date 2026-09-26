import type { TransactionQuery } from '@data-stores/psql/types'
import { write } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { getPostByAny } from '@services/posts/get'
import { getRssFeedItemById } from '@services/rss-feed-items'
import type { PrivateUser } from '@services/users/types'
import createError from 'http-errors'
import sql from 'sql-template-strings'
import { assertDistributablePost, type DistributionPost } from './shared.mts'
import type { FollowerDistributionAction } from './types.mts'
import type { SendFollowersInput } from './send-followers-input.mts'

export type CreateDistributionInput = {
  action: FollowerDistributionAction
  postIdOrSlug?: string
  rssFeedItemId?: string
  options: SendFollowersInput
}

export async function validateTarget(
  currentUser: PrivateUser,
  input: CreateDistributionInput,
  query: TransactionQuery,
): Promise<{ kind: 'post' | 'rss_feed_item'; id: string }> {
  if (input.action === 'post_share' || input.action === 'post_send') {
    return {
      kind: 'post',
      id: await preflightPostDistributionTarget(currentUser, input.action, input.postIdOrSlug!, {
        query,
      }),
    }
  }

  return {
    kind: 'rss_feed_item',
    id: await preflightRssFeedItemDistributionTarget(input.rssFeedItemId!, { query }),
  }
}

export async function preflightRssFeedItemDistributionTarget(
  rssFeedItemId: string,
  options?: { query?: TransactionQuery },
): Promise<string> {
  const item = await getRssFeedItemById(rssFeedItemId, { query: options?.query ?? write })
  if (!item) throw createError(404, 'RSS feed item not found')
  return item.id
}

export async function preflightPostDistributionTarget(
  currentUser: PrivateUser,
  action: 'post_share' | 'post_send',
  postIdOrSlug: string,
  options?: { query?: TransactionQuery },
): Promise<string> {
  const post = (await getPostByAny(postIdOrSlug, {
    query: options?.query ?? write,
  })) as DistributionPost | null
  if (!post) throw createError(404, 'Post not found')
  assertDistributablePost(post, currentUser.id, action === 'post_share' ? 'share' : 'send')
  return post.id
}

export async function assertNoRecentDistribution(
  senderUserId: string,
  action: FollowerDistributionAction,
  entityId: string,
  query: TransactionQuery,
) {
  const recentCutoffId = getMinUUIDv7ForDate(new Date(Date.now() - 24 * 60 * 60 * 1000))
  const existing = await query(
    recentDistributionQuery(senderUserId, action, entityId, recentCutoffId),
  )
  if (existing.rows.length > 0) {
    throw createError(
      429,
      `You can only ${action.includes('share') ? 'share' : 'send'} this once per day`,
    )
  }

  const previousRows = await query(
    recentTargetRowsQuery(senderUserId, action, entityId, recentCutoffId),
  )
  if (previousRows.rows.length > 0) {
    throw createError(
      429,
      `You can only ${action.includes('share') ? 'share' : 'send'} this once per day`,
    )
  }
}

export function dedupLockKey(
  senderUserId: string,
  action: FollowerDistributionAction,
  entityId: string,
): string {
  return `follower-distribution:${senderUserId}:${action}:${entityId}`
}

function recentDistributionQuery(
  senderUserId: string,
  action: FollowerDistributionAction,
  entityId: string,
  recentCutoffId: string,
) {
  const statement = sql`/* assertNoRecentDistribution */
    SELECT 1
    FROM follower_distributions
    WHERE sender_user_id = ${senderUserId}
      AND action = ${action}
      AND failed_at IS NULL
      AND id > ${recentCutoffId}
      AND (
        completed_at IS NULL
        OR EXISTS (
          SELECT 1
          FROM follower_distribution_deliveries
          WHERE follower_distribution_deliveries.distribution_id = follower_distributions.id
        )
      )
  `
  if (action === 'post_share' || action === 'post_send') {
    statement.append(sql` AND post_id = ${entityId}`)
  } else {
    statement.append(sql` AND rss_feed_item_id = ${entityId}`)
  }
  statement.append(sql` LIMIT 1`)
  return statement
}

function recentTargetRowsQuery(
  senderUserId: string,
  action: FollowerDistributionAction,
  entityId: string,
  recentCutoffId: string,
) {
  switch (action) {
    case 'post_share':
      return sql`/* recentTargetRowsQuery */
        SELECT 1 FROM post_feed_shares
        WHERE shared_by_user_id = ${senderUserId}
          AND post_id = ${entityId}
          AND id > ${recentCutoffId}
        LIMIT 1
      `
    case 'post_send':
      return sql`/* recentTargetRowsQuery */
        SELECT 1 FROM notifications
        WHERE sent_by_user_id = ${senderUserId}
          AND post_id = ${entityId}
          AND delivery_type = 'manual_send'
          AND id > ${recentCutoffId}
        LIMIT 1
      `
    case 'rss_feed_item_share':
      return sql`/* recentTargetRowsQuery */
        SELECT 1 FROM rss_feed_item_feed_shares
        WHERE shared_by_user_id = ${senderUserId}
          AND rss_feed_item_id = ${entityId}
          AND id > ${recentCutoffId}
        LIMIT 1
      `
    case 'rss_feed_item_send':
      return sql`/* recentTargetRowsQuery */
        SELECT 1 FROM notifications
        WHERE sent_by_user_id = ${senderUserId}
          AND rss_feed_item_id = ${entityId}
          AND delivery_type = 'manual_send'
          AND id > ${recentCutoffId}
        LIMIT 1
      `
  }
}
