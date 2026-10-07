import { beginTransaction } from '@data-stores/psql'
import {
  FOLLOWER_DISTRIBUTION_SEED_COUNT,
  postSeedTimestampMs,
  seedUuid,
  seedUuidAtTimestamp,
} from './common.mts'

/** Four failed-but-delivered actions per sender, amid a substantial unrelated sender cohort. */
export async function seedFollowerDistributions(): Promise<void> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ id: string }>(
    `/* seedExplainData */ SELECT id FROM rss_feed_items ORDER BY id LIMIT 1`,
  )
  const itemId = rows[0]?.id
  if (!itemId) throw new Error('Follower distribution seed requires RSS items')
  const actions = ['post_share', 'post_send', 'rss_feed_item_share', 'rss_feed_item_send']
  for (let offset = 0; offset < FOLLOWER_DISTRIBUTION_SEED_COUNT; offset += 500) {
    const ids = Array.from({ length: 500 }, (_, i) =>
      seedUuidAtTimestamp(postSeedTimestampMs(0), 600_000 + offset + i),
    )
    const senders = ids.map((_, i) => seedUuid(Math.floor((offset + i) / 4), '01'))
    const actionBatch = ids.map((_, i) => actions[(offset + i) % 4])
    await transaction(
      `/* seedExplainData */ INSERT INTO follower_distributions
        (id, sender_user_id, action, audience, post_id, rss_feed_item_id, failed_at)
       SELECT id, sender, action, 'all_followers',
         CASE WHEN action IN ('post_share', 'post_send') THEN $4::uuid END,
         CASE WHEN action IN ('rss_feed_item_share', 'rss_feed_item_send') THEN $5::uuid END,
         CURRENT_TIMESTAMP
       FROM UNNEST($1::uuid[], $2::uuid[], $3::follower_distribution_actions[]) AS s(id, sender, action)
       ON CONFLICT DO NOTHING`,
      [ids, senders, actionBatch, seedUuid(0, '05'), itemId],
    )
    await transaction(
      `/* seedExplainData */ INSERT INTO follower_distribution_deliveries
        (distribution_id, recipient_user_id, delivery_id)
       SELECT id, $2::uuid, id FROM UNNEST($1::uuid[]) AS s(id)
       ON CONFLICT DO NOTHING`,
      [ids, seedUuid(19_999, '01')],
    )
  }
  await transaction.commit()
}
