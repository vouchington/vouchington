import { beginTransaction } from '@data-stores/psql'
import type { PrivateUser } from '@services/users/types'
import sql from 'sql-template-strings'
import {
  assertCanDistribute,
  dedupLockKey,
  type CreateDistributionInput,
  validateTarget,
} from './create-guards.mts'
import type { FollowerDistributionAccepted } from './types.mts'
import { parseSendFollowersInput, type SendFollowersInput } from './send-followers-input.mts'

export type FollowerDistributionOptions = SendFollowersInput

/**
 * Options resolved by a function run after the target exists: a missing target answers 404 before
 * an invalid body answers its own error, with no separate read of the target.
 */
export type DeferredFollowerDistributionOptions = () => FollowerDistributionOptions

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
  options: FollowerDistributionOptions | DeferredFollowerDistributionOptions,
): Promise<FollowerDistributionAccepted> {
  return createDistribution(currentUser, { action: 'rss_feed_item_send', rssFeedItemId, options })
}

async function createDistribution(
  currentUser: PrivateUser,
  input: CreateDistributionInput,
): Promise<FollowerDistributionAccepted> {
  const eagerOptions =
    typeof input.options === 'function' ? null : parseSendFollowersInput(input.options)
  await using query = await beginTransaction()
  const target = await validateTarget(currentUser, input, query)
  const options = eagerOptions ?? parseSendFollowersInput((input.options as () => unknown)())
  // ast-grep-ignore: no-three-sequential-awaits -- target.id keys the lock, the guard result gates the distribution insert, and that insert's id feeds the recipient insert; the lock stays its own statement so the guard reads after the previous holder committed
  await query(sql`/* createDistribution:lock */
    SELECT pg_advisory_xact_lock(hashtext(${dedupLockKey(currentUser.id, input.action, target.id)}))
  `)
  const selectedRecipientIds = await assertCanDistribute(
    currentUser.id,
    input.action,
    target.id,
    options.audience === 'selected_followers' ? options.recipient_user_ids.toSorted() : null,
    query,
  )

  const { rows } = await query(sql`/* createDistribution */
    INSERT INTO follower_distributions (
      sender_user_id,
      action,
      audience,
      post_id,
      rss_feed_item_id
    )
    VALUES (
      ${currentUser.id},
      ${input.action},
      ${options.audience},
      ${target.kind === 'post' ? target.id : null},
      ${target.kind === 'rss_feed_item' ? target.id : null}
    )
    RETURNING id
  `)
  const distributionId = rows[0]!.id as string
  if (selectedRecipientIds) {
    await query(sql`/* createDistribution:selectedRecipients */
      INSERT INTO follower_distribution_selected_recipients (
        distribution_id,
        recipient_user_id
      )
      SELECT ${distributionId}, selected.recipient_user_id
      FROM unnest(${selectedRecipientIds}::uuid[]) AS selected(recipient_user_id)
      ORDER BY selected.recipient_user_id
    `)
  }

  const result = { status: 'accepted', distribution_id: distributionId }
  await query.commit()
  return result as FollowerDistributionAccepted
}
