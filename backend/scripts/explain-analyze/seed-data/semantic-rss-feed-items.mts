import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { seedUuid } from './common.mts'

const SEMANTIC_RSS_ITEM_COUNT = 256
const SEMANTIC_STORY_PAIR_COUNT = 32

/**
 * Adds a bounded, deterministic vector-search cohort to the normal RSS seed.
 * The first 192 rows are standalone; the remaining 64 form 32 story pairs.
 */
export async function seedSemanticRssFeedItems(): Promise<void> {
  console.log(`Seeding ${SEMANTIC_RSS_ITEM_COUNT} semantic RSS feed items...`)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await seedSemanticStories(query)
    await attachSemanticVectorsAndStories(query)

    await transaction.commit()
  }
}

async function seedSemanticStories(query: TransactionQuery): Promise<void> {
  const values: unknown[] = []
  const rows: string[] = []
  for (let index = 0; index < SEMANTIC_STORY_PAIR_COUNT; index++) {
    values.push(seedUuid(100_000 + index, '17'), `Seed semantic story ${index}`)
    const base = values.length - 1
    rows.push(`($${base}::uuid, $${base + 1}::text)`)
  }
  await query(
    `/* seedExplainData */ INSERT INTO stories (id, title)
     VALUES ${rows.join(', ')} ON CONFLICT (id) DO NOTHING`,
    values,
  )
}

async function attachSemanticVectorsAndStories(query: TransactionQuery): Promise<void> {
  await query(
    `/* seedExplainData */ WITH semantic_items AS (
       SELECT ids.id, row_number() OVER (ORDER BY ids.id)::int - 1 AS row_index
       FROM rss_feed_item_ids ids
       WHERE ids.guid LIKE 'seed-item-guid-%'
       ORDER BY ids.id
       LIMIT $1
     ), semantic_stories AS (
       SELECT id, row_number() OVER (ORDER BY id)::int - 1 AS story_index
       FROM stories
       WHERE id >= $2::uuid AND id < $3::uuid
     )
     UPDATE rss_feed_items items
     SET bedrock_nova_multimodal_v1_embedding = (
       ARRAY[1::real, semantic_items.row_index::real / 10000]
       || array_fill(0::real, ARRAY[1022])
     )::vector,
     story_id = semantic_stories.id
     FROM semantic_items
     LEFT JOIN semantic_stories
       ON semantic_stories.story_index = (semantic_items.row_index - 192) / 2
      AND semantic_items.row_index >= 192
     WHERE items.id = semantic_items.id`,
    [
      SEMANTIC_RSS_ITEM_COUNT,
      seedUuid(100_000, '17'),
      seedUuid(100_000 + SEMANTIC_STORY_PAIR_COUNT, '17'),
    ],
  )
}
