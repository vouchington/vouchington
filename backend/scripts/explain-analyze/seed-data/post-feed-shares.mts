import { beginTransaction } from '@data-stores/psql'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'

export const POST_SHARE_SPARSE_TARGET_COUNT = 8
export const POST_SHARE_DENSE_TARGET_COUNT = 1000
export const POST_SHARE_SPARSE_DELIVERIES_PER_TARGET = 16
export const POST_SHARE_DENSE_DELIVERIES_PER_TARGET = 4
export const POST_SHARE_EMPTY_USER_INDEX = 19_999
const FIRST_TARGET_POST_INDEX = 0
const HEAVY_FOLLOW_FIRST_POST_INDEX = 2
const HEAVY_FOLLOW_POST_COUNT = 1_000

/** Keep repeated share targets in the recent window with positive support for hot ranking. */
export async function seedPostFeedHotStats(): Promise<void> {
  const heavyFollowPostIds = Array.from({ length: HEAVY_FOLLOW_POST_COUNT }, (_, index) =>
    seedUuid(HEAVY_FOLLOW_FIRST_POST_INDEX + index, '05'),
  )
  const sharedPostIds = Array.from({ length: POST_SHARE_DENSE_TARGET_COUNT }, (_, index) =>
    seedUuid(FIRST_TARGET_POST_INDEX + index, '05'),
  )
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedPostFeedHotStats */
     UPDATE posts
     SET votes_score_up = 2, votes_count_up = 2
     WHERE id = ANY($1::uuid[]) OR id = ANY($2::uuid[])`,
    [heavyFollowPostIds, sharedPostIds],
  )
  await transaction(`/* seedPostFeedHotStats:analyze */ ANALYZE posts`)
  await transaction.commit()
}

type PostShareSeedIdentities = {
  recipientIds: readonly [string, string]
  sharedById: string
  emptyRecipientId: string
  targetPostIds: readonly string[]
  deliveryIdBase: number
}

function postShareSeedRows(
  identities: PostShareSeedIdentities,
  recipientIndex: number,
  targetCount: number,
  deliveriesPerTarget: number,
): Array<{ id: string; postId: string; sortAt: Date }> {
  return Array.from({ length: targetCount * deliveriesPerTarget }, (_, deliveryIndex) => {
    const sortAtMs = postSeedTimestampMs(0) - deliveryIndex * 1000
    return {
      id: seedUuidAtTimestamp(
        sortAtMs,
        identities.deliveryIdBase + recipientIndex * 10_000 + deliveryIndex,
      ),
      postId: identities.targetPostIds[deliveryIndex % targetCount]!,
      sortAt: new Date(sortAtMs),
    }
  })
}

export async function seedPostFeedShares(
  providedIdentities?: PostShareSeedIdentities,
): Promise<void> {
  const identities = providedIdentities ?? {
    recipientIds: [seedUuid(0, '01'), seedUuid(1, '01')],
    sharedById: seedUuid(2, '01'),
    emptyRecipientId: seedUuid(POST_SHARE_EMPTY_USER_INDEX, '01'),
    targetPostIds: Array.from({ length: POST_SHARE_DENSE_TARGET_COUNT }, (_, index) =>
      seedUuid(FIRST_TARGET_POST_INDEX + index, '05'),
    ),
    deliveryIdBase: 1_000_000,
  }
  console.log('Seeding repeated post feed share targets...')
  if (!providedIdentities) await seedPostFeedHotStats()
  await using transaction = await beginTransaction()
  for (const [recipientIndex, targetCount, deliveriesPerTarget] of [
    [0, POST_SHARE_SPARSE_TARGET_COUNT, POST_SHARE_SPARSE_DELIVERIES_PER_TARGET],
    [1, POST_SHARE_DENSE_TARGET_COUNT, POST_SHARE_DENSE_DELIVERIES_PER_TARGET],
  ] as const) {
    const rows = postShareSeedRows(identities, recipientIndex, targetCount, deliveriesPerTarget)
    await transaction(
      `/* seedExplainData */ INSERT INTO post_feed_shares
        (recipient_user_id, id, shared_by_id, post_id, sort_at)
       SELECT $1::uuid, delivery.id, $2::uuid, delivery.post_id, delivery.sort_at
       FROM UNNEST($3::uuid[], $4::uuid[], $5::timestamptz[])
         AS delivery(id, post_id, sort_at)
       ON CONFLICT (recipient_user_id, id) DO UPDATE
         SET shared_by_id = EXCLUDED.shared_by_id,
             post_id = EXCLUDED.post_id,
             sort_at = EXCLUDED.sort_at`,
      [
        identities.recipientIds[recipientIndex],
        identities.sharedById,
        rows.map(row => row.id),
        rows.map(row => row.postId),
        rows.map(row => row.sortAt),
      ],
    )
  }
  await transaction(
    `/* seedExplainData */ INSERT INTO relation__user__follow__user
      (subject_id, object_id, created_by_id) VALUES ($1, $2, $1) ON CONFLICT DO NOTHING`,
    [identities.emptyRecipientId, identities.sharedById],
  )
  await transaction.commit()
}
