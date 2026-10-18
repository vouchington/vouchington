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
  options: SendFollowersInput | (() => SendFollowersInput)
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

async function preflightRssFeedItemDistributionTarget(
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

// One statement after the advisory lock, so it reads what the previous lock holder committed.
// Precedence is unchanged: a recent distribution (429) wins over a selected recipient who is no
// longer a follower (400).
export async function assertCanDistribute(
  senderUserId: string,
  action: FollowerDistributionAction,
  entityId: string,
  selectedRecipientIds: string[] | null,
  query: TransactionQuery,
): Promise<string[] | null> {
  const recentCutoffId = getMinUUIDv7ForDate(new Date(Date.now() - 24 * 60 * 60 * 1000))
  const statement = sql`/* assertCanDistribute */
    SELECT EXISTS (`
  statement.append(recentDistributionQuery(senderUserId, action, entityId, recentCutoffId))
  statement.append(sql`) AS has_recent, `)
  if (selectedRecipientIds) {
    statement.append(sql`ARRAY(
      SELECT subject_id
      FROM relation__user__follow__user
      WHERE object_id = ${senderUserId}
        AND deleted_at IS NULL
        AND subject_id = ANY(${selectedRecipientIds}::uuid[])
    ) AS follower_ids`)
  } else {
    statement.append(sql`ARRAY[]::uuid[] AS follower_ids`)
  }
  const { rows } = await query(statement)
  if (rows[0]!.has_recent) {
    throw createError(
      429,
      `You can only ${action.includes('share') ? 'share' : 'send'} this once per day`,
    )
  }
  if (!selectedRecipientIds) return null
  const followerIds = rows[0]!.follower_ids as string[]
  if (followerIds.length !== selectedRecipientIds.length) {
    throw createError(400, 'Selected users must be current followers')
  }
  return followerIds.toSorted()
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
  const statement = sql`SELECT 1
    FROM follower_distributions
    WHERE sender_user_id = ${senderUserId}
      AND action = ${action}
      AND id > ${recentCutoffId}
      AND (
        (failed_at IS NULL AND completed_at IS NULL)
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
