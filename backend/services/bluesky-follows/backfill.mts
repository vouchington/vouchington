import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getBlueskyFollowsWorkLimit } from './work-limits.mts'

export type BlueskyFollowPropagationCandidate = {
  followerUserId: string
  followeeUserId: string
}

export type BlueskyFollowPropagationCandidatePage = {
  candidates: BlueskyFollowPropagationCandidate[]
  hasMore: boolean
}

// Sorts before every UUID, so the first page needs no separate "no cursor" predicate.
const START_OF_IDS = '00000000-0000-0000-0000-000000000000'

/**
 * One page of (follower, followee) pairs after `after`, in pair order. `hasMore` is true when the
 * page is full, so the caller continues from its last pair.
 *
 * Pairs that may need Bluesky follow-record reconciliation: every active local follow relation
 * between two users who both have a linked Bluesky account (a "desired: yes" candidate) UNIONed with
 * every existing bluesky_follow_records receipt (a "receipt exists" candidate, catching a pair that
 * was unfollowed after its receipt was created). reconcileBlueskyFollow is a safe no-op for any pair
 * already in sync, so over-inclusion here is harmless: this is a rare recovery operation (e.g. after
 * a Valkey wipe lost in-flight reconcile jobs), not a hot path. Filtering by bluesky_linked_accounts
 * keeps the (much larger) set of local-only follow relations that have nothing to do with Bluesky out
 * of the backfill entirely. Each arm applies the cursor itself so a page never reads the whole set.
 */
export async function listBlueskyFollowPropagationCandidatePage(
  after?: BlueskyFollowPropagationCandidate,
): Promise<BlueskyFollowPropagationCandidatePage> {
  const limit = getBlueskyFollowsWorkLimit('backfill_batch_size')
  const { rows } = await read<{ follower_user_id: string; followee_user_id: string }>(
    candidatePageQuery(after, limit),
  )
  return {
    candidates: rows.map(row => ({
      followerUserId: row.follower_user_id,
      followeeUserId: row.followee_user_id,
    })),
    hasMore: rows.length === limit,
  }
}

export function candidatePageQuery(
  after: BlueskyFollowPropagationCandidate | undefined,
  limit: number,
) {
  const afterFollower = after?.followerUserId ?? START_OF_IDS
  const afterFollowee = after?.followeeUserId ?? START_OF_IDS
  return sql`/* listBlueskyFollowPropagationCandidatePage */
    SELECT follower_user_id, followee_user_id FROM (
      SELECT f.subject_id AS follower_user_id, f.object_id AS followee_user_id
      FROM relation__user__follow__user f
      JOIN bluesky_linked_accounts follower_account ON follower_account.user_id = f.subject_id
      JOIN bluesky_linked_accounts followee_account ON followee_account.user_id = f.object_id
      JOIN bluesky_link_authorizations follower_authorization
        ON follower_authorization.id = follower_account.link_authorization_id
       AND follower_authorization.status = 'attached'
      JOIN bluesky_link_authorizations followee_authorization
        ON followee_authorization.id = followee_account.link_authorization_id
       AND followee_authorization.status = 'attached'
      JOIN users follower ON follower.id = f.subject_id AND follower.deleted_at IS NULL
      JOIN users followee ON followee.id = f.object_id AND followee.deleted_at IS NULL
      WHERE f.deleted_at IS NULL
        AND (f.subject_id, f.object_id) > (${afterFollower}::uuid, ${afterFollowee}::uuid)
        AND follower_account.disconnect_requested_at IS NULL
        AND followee_account.disconnect_requested_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_suspensions
          WHERE user_id IN (follower.id, followee.id) AND lifted_at IS NULL
        )
      UNION
      SELECT receipt.follower_user_id, receipt.followee_user_id
      FROM bluesky_follow_records receipt
      JOIN bluesky_linked_accounts follower_account
        ON follower_account.user_id = receipt.follower_user_id
      JOIN bluesky_linked_accounts followee_account
        ON followee_account.user_id = receipt.followee_user_id
      JOIN bluesky_link_authorizations follower_authorization
        ON follower_authorization.id = follower_account.link_authorization_id
       AND follower_authorization.status = 'attached'
      JOIN bluesky_link_authorizations followee_authorization
        ON followee_authorization.id = followee_account.link_authorization_id
       AND followee_authorization.status = 'attached'
      JOIN users follower
        ON follower.id = receipt.follower_user_id AND follower.deleted_at IS NULL
      JOIN users followee
        ON followee.id = receipt.followee_user_id AND followee.deleted_at IS NULL
      WHERE (receipt.follower_user_id, receipt.followee_user_id)
          > (${afterFollower}::uuid, ${afterFollowee}::uuid)
        AND NOT EXISTS (
          SELECT 1 FROM user_suspensions
          WHERE user_id IN (follower.id, followee.id) AND lifted_at IS NULL
        )
        AND follower_account.disconnect_requested_at IS NULL
        AND followee_account.disconnect_requested_at IS NULL
    ) candidates
    ORDER BY follower_user_id, followee_user_id
    LIMIT ${limit}
  `
}
