import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { getFollowerIdsForDistribution } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import createError from 'http-errors'
import sql from 'sql-template-strings'
import {
  assertNoRecentDistribution,
  dedupLockKey,
  type CreateDistributionInput,
  validateTarget,
} from './create-guards.mts'
import { type FollowerDistributionAccepted } from './types.mts'
import { parseSendFollowersInput, type SendFollowersInput } from './send-followers-input.mts'

export type FollowerDistributionOptions = SendFollowersInput

export function sharePostWithFollowers(
  currentUser: PrivateUser,
  postIdOrSlug: string,
): Promise<FollowerDistributionAccepted> {
  return createDistribution(currentUser, {
    action: 'post_share',
    postIdOrSlug,
    options: { audience: 'all_followers' },
  })
}

export function sendPostToFollowers(
  currentUser: PrivateUser,
  postIdOrSlug: string,
  options: FollowerDistributionOptions,
): Promise<FollowerDistributionAccepted> {
  return createDistribution(currentUser, { action: 'post_send', postIdOrSlug, options })
}

export function shareRssFeedItemWithFollowers(
  currentUser: PrivateUser,
  rssFeedItemId: string,
): Promise<FollowerDistributionAccepted> {
  return createDistribution(currentUser, {
    action: 'rss_feed_item_share',
    rssFeedItemId,
    options: { audience: 'all_followers' },
  })
}

export function sendRssFeedItemToFollowers(
  currentUser: PrivateUser,
  rssFeedItemId: string,
  options: FollowerDistributionOptions,
): Promise<FollowerDistributionAccepted> {
  return createDistribution(currentUser, { action: 'rss_feed_item_send', rssFeedItemId, options })
}

async function createDistribution(
  currentUser: PrivateUser,
  input: CreateDistributionInput,
): Promise<FollowerDistributionAccepted> {
  const options = parseSendFollowersInput(input.options)
  await using query = await beginTransaction()
  // ast-grep-ignore: no-three-sequential-awaits -- service workflow has dependent validation, mutation, and follow-up side effects
  const target = await validateTarget(currentUser, input, query)
  await query(sql`/* createDistribution */
    SELECT pg_advisory_xact_lock(hashtext(${dedupLockKey(currentUser.id, input.action, target.id)}))
  `)
  await assertNoRecentDistribution(currentUser.id, input.action, target.id, query)

  const selectedRecipientIds = await validateSelectedRecipients(currentUser.id, options, query)

  const { rows } = await query(sql`/* createDistribution */
    INSERT INTO follower_distributions (
      sender_user_id,
      action,
      audience,
      post_id,
      rss_feed_item_id,
      selected_recipient_user_ids
    )
    VALUES (
      ${currentUser.id},
      ${input.action},
      ${options.audience},
      ${target.kind === 'post' ? target.id : null},
      ${target.kind === 'rss_feed_item' ? target.id : null},
      ${selectedRecipientIds}::uuid[]
    )
    RETURNING id
  `)

  const result = { status: 'accepted', distribution_id: rows[0]!.id as string }
  await query.commit()
  return result as FollowerDistributionAccepted
}

async function validateSelectedRecipients(
  senderUserId: string,
  options: FollowerDistributionOptions,
  query: TransactionQuery,
): Promise<string[] | null> {
  if (options.audience !== 'selected_followers') return null

  const recipientUserIds = options.recipient_user_ids.toSorted()
  const currentFollowerIds = await getFollowerIdsForDistribution(senderUserId, recipientUserIds, {
    query,
  })
  if (currentFollowerIds.length !== recipientUserIds.length) {
    throw createError(400, 'Selected users must be current followers')
  }
  return currentFollowerIds.toSorted()
}
