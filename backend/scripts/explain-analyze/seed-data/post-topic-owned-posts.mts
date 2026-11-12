import { beginTransaction } from '@data-stores/psql'
import { seedUuid, seedUuidAtTimestamp } from './common.mts'
import { seedPosts } from './posts.mts'

const FIRST_INDEX = 800_000
const INSTANT = Date.UTC(9999, 11, 31, 23, 59, 58)
export const POST_TOPIC_OWNED_IDS = Array.from({ length: 65 }, (_, index) =>
  seedUuidAtTimestamp(INSTANT, FIRST_INDEX + index),
)
export const POST_TOPIC_FEED_POST_ID = POST_TOPIC_OWNED_IDS[0]!
export const POST_TOPIC_FEED_RELATION_IDS = [0, 1].map(index =>
  seedUuidAtTimestamp(INSTANT + 1000, FIRST_INDEX + index),
)

/** A small owned cohort keeps the witnesses ahead of unrelated late scenario writes. */
export async function seedPostTopicOwnedPosts(): Promise<void> {
  await seedPosts(
    POST_TOPIC_OWNED_IDS.length,
    FIRST_INDEX,
    () => 'discussion',
    index => POST_TOPIC_OWNED_IDS[index - FIRST_INDEX]!,
  )
  await using transaction = await beginTransaction()
  await transaction(
    '/* seedPostTopicOwnedPosts:authors */ UPDATE posts SET created_by_id = $1::uuid WHERE id = ANY($2::uuid[])',
    [seedUuid(0, '01'), POST_TOPIC_OWNED_IDS],
  )
  await transaction.commit()
}
