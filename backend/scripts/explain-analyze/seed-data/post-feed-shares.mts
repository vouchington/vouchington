import { beginTransaction } from '@data-stores/psql'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'

export const POST_SHARE_SPARSE_TARGET_COUNT = 8
export const POST_SHARE_DENSE_TARGET_COUNT = 1000
export const POST_SHARE_SPARSE_DELIVERIES_PER_TARGET = 8
export const POST_SHARE_DENSE_DELIVERIES_PER_TARGET = 4
export const POST_SHARE_EMPTY_USER_INDEX = 19_999
const FIRST_TARGET_POST_INDEX = 60_000

export function postShareSeedRows(
  recipientIndex: number,
  targetCount: number,
  deliveriesPerTarget: number,
): Array<{ id: string; postId: string; sortAt: Date }> {
  return Array.from({ length: targetCount * deliveriesPerTarget }, (_, deliveryIndex) => {
    const sortAtMs = postSeedTimestampMs(0) - deliveryIndex * 1000
    return {
      id: seedUuidAtTimestamp(sortAtMs, 1_000_000 + recipientIndex * 10_000 + deliveryIndex),
      postId: seedUuid(FIRST_TARGET_POST_INDEX + (deliveryIndex % targetCount), '05'),
      sortAt: new Date(sortAtMs),
    }
  })
}

export async function seedPostFeedShares(): Promise<void> {
  console.log('Seeding repeated post feed share targets...')
  await using transaction = await beginTransaction()
  for (const [recipientIndex, targetCount, deliveriesPerTarget] of [
    [0, POST_SHARE_SPARSE_TARGET_COUNT, POST_SHARE_SPARSE_DELIVERIES_PER_TARGET],
    [1, POST_SHARE_DENSE_TARGET_COUNT, POST_SHARE_DENSE_DELIVERIES_PER_TARGET],
  ] as const) {
    const rows = postShareSeedRows(recipientIndex, targetCount, deliveriesPerTarget)
    await transaction(
      `/* seedExplainData */ INSERT INTO post_feed_shares
        (recipient_user_id, id, shared_by_user_id, post_id, sort_at)
       SELECT $1::uuid, delivery.id, $2::uuid, delivery.post_id, delivery.sort_at
       FROM UNNEST($3::uuid[], $4::uuid[], $5::timestamptz[])
         AS delivery(id, post_id, sort_at)
       ON CONFLICT DO NOTHING`,
      [
        seedUuid(recipientIndex, '01'),
        seedUuid(2, '01'),
        rows.map(row => row.id),
        rows.map(row => row.postId),
        rows.map(row => row.sortAt),
      ],
    )
  }
  await transaction(
    `/* seedExplainData */ INSERT INTO relation__user__follow__user
      (subject_id, object_id, created_by_id) VALUES ($1, $2, $1) ON CONFLICT DO NOTHING`,
    [seedUuid(POST_SHARE_EMPTY_USER_INDEX, '01'), seedUuid(2, '01')],
  )
  await transaction.commit()
}
