import { beginTransaction } from '@data-stores/psql'
import { HOSTNAME_COUNT, seedUuid } from './common.mts'

export const FRIEND_TRUST_VIEWER_INDEX = 19_998
export const FRIEND_TRUST_FOLLOW_COUNT = 2_000
// Longer than the default votes_per_friend_limit (20), so the per-friend bound is exercised.
export const FRIEND_TRUST_VOTES_PER_FRIEND = 25
// Only the newest follows are ever read (default friend_follow_limit is 1000), so only they carry ballots.
const FRIENDS_WITH_VOTES = 1500
export const FRIEND_TRUST_VOTE_ROWS = FRIENDS_WITH_VOTES * FRIEND_TRUST_VOTES_PER_FRIEND
// Votes wrap over this many hostnames, so every friend re-votes (and sometimes flips) hostnames.
const DISTINCT_HOSTNAMES_PER_FRIEND = 18
const FIRST_FRIEND_INDEX = 100

/**
 * A viewer following twice the 1,000-follow default, whose friends' ballot ledgers are long and
 * re-vote the same hostnames. The older ballot on a re-voted hostname is an upvote and the newer
 * one a downvote, so latest-per-hostname must pick the newest ballot. Kept to 2k follows because a
 * larger one-subject follow skew flips the generic plan of the follow-context vote lookup.
 */
export async function seedFriendTrustedHostnames(): Promise<void> {
  console.log(
    `Seeding ${FRIEND_TRUST_FOLLOW_COUNT} follows (newest ${FRIENDS_WITH_VOTES} with ${FRIEND_TRUST_VOTES_PER_FRIEND} hostname votes each) for the friend-trusted viewer...`,
  )
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedExplainData */ INSERT INTO relation__user__follow__user (subject_id, object_id, created_by_id)
     SELECT $1::uuid, ($2 || lpad(to_hex($3::int + n), 12, '0'))::uuid, $1::uuid
     FROM generate_series(0, $4::int - 1) AS n
     ON CONFLICT DO NOTHING`,
    [
      seedUuid(FRIEND_TRUST_VIEWER_INDEX, '01'),
      seedUuid(0, '01').slice(0, -12),
      FIRST_FRIEND_INDEX,
      FRIEND_TRUST_FOLLOW_COUNT,
    ],
  )
  await transaction(
    `/* seedExplainData */ INSERT INTO hostname_votes (hostname_id, user_id, score)
     SELECT
       ($1 || lpad(to_hex((n * 31 + (v % $5::int)) % $6::int), 12, '0'))::uuid,
       ($2 || lpad(to_hex($3::int + n), 12, '0'))::uuid,
       CASE WHEN v < $5::int THEN 1 ELSE -1 END
     FROM generate_series($8::int, $4::int - 1) AS n
     CROSS JOIN generate_series(0, $7::int - 1) AS v
     ORDER BY n, v`,
    [
      seedUuid(0, '02').slice(0, -12),
      seedUuid(0, '01').slice(0, -12),
      FIRST_FRIEND_INDEX,
      FRIEND_TRUST_FOLLOW_COUNT,
      DISTINCT_HOSTNAMES_PER_FRIEND,
      HOSTNAME_COUNT,
      FRIEND_TRUST_VOTES_PER_FRIEND,
      FRIEND_TRUST_FOLLOW_COUNT - FRIENDS_WITH_VOTES,
    ],
  )
  await transaction.commit()
}
