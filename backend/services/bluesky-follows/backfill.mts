import { createAsyncGeneratorFromCursor } from '@data-stores/psql'

const BACKFILL_BATCH_SIZE = 500

export type BlueskyFollowPropagationCandidate = {
  followerUserId: string
  followeeUserId: string
}

export const BLUESKY_FOLLOW_PROPAGATION_CANDIDATE_QUERY = `/* streamBlueskyFollowPropagationCandidateBatches */
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
      WHERE NOT EXISTS (
        SELECT 1 FROM user_suspensions
        WHERE user_id IN (follower.id, followee.id) AND lifted_at IS NULL
      )
        AND follower_account.disconnect_requested_at IS NULL
        AND followee_account.disconnect_requested_at IS NULL
    ) candidates
    ORDER BY follower_user_id, followee_user_id
  `

// Streams (follower, followee) pairs that may need Bluesky follow-record reconciliation:
// every active local follow relation between two users who both have a linked Bluesky account
// (a "desired: yes" candidate) UNIONed with every existing bluesky_follow_records receipt (a
// "receipt exists" candidate, catching a pair that was unfollowed after its receipt was created).
// reconcileBlueskyFollow is a safe no-op for any pair already in sync, so over-inclusion here is
// harmless — this is a rare recovery operation (e.g. after a Valkey wipe lost in-flight reconcile
// jobs), not a hot path. Filtering by bluesky_linked_accounts keeps the (much larger) set of
// local-only follow relations that have nothing to do with Bluesky out of the backfill entirely.
export async function* streamBlueskyFollowPropagationCandidateBatches(): AsyncGenerator<
  BlueskyFollowPropagationCandidate[],
  void,
  unknown
> {
  yield* streamBlueskyFollowPropagationCandidateBatchesFromRows(
    createAsyncGeneratorFromCursor<{
      follower_user_id: string
      followee_user_id: string
    }>(BLUESKY_FOLLOW_PROPAGATION_CANDIDATE_QUERY, {
      batchSize: BACKFILL_BATCH_SIZE,
    }),
  )
}

export async function* streamBlueskyFollowPropagationCandidateBatchesFromRows(
  rows: AsyncIterable<{ follower_user_id: string; followee_user_id: string }>,
): AsyncGenerator<BlueskyFollowPropagationCandidate[], void, unknown> {
  let batch: BlueskyFollowPropagationCandidate[] = []
  for await (const row of rows) {
    batch.push({ followerUserId: row.follower_user_id, followeeUserId: row.followee_user_id })
    if (batch.length >= BACKFILL_BATCH_SIZE) {
      yield batch
      batch = []
    }
  }
  if (batch.length > 0) {
    yield batch
  }
}
