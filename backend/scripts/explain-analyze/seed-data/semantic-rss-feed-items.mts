import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { RSS_FEED_ITEM_SEED_COUNT, seedUuid } from './common.mts'

const HNSW_INDEX = 'idx_rss_feed_items__bedrock_nova_multimodal_v1_embedding'
const SEMANTIC_STORY_START_INDEX = 192
const SEMANTIC_COHORT_COUNT = 256
const SEMANTIC_STORY_PAIR_COUNT = 32
const UNLINKED_STORY_COUNT = 1002
export const SEMANTIC_RSS_STORY_MEMBER_COUNT = SEMANTIC_STORY_PAIR_COUNT * 2

/**
 * Attaches deterministic vectors across the full seeded RSS corpus (25k items) so unscoped
 * semantic search exercises the HNSW index at realistic capacity. The first 256 rows preserve the
 * deterministic story cohort (192 standalone + 32 story pairs); roughly 5% of the remaining items
 * match the query vector and 95% are unrelated.
 */
export async function seedSemanticRssFeedItems(): Promise<void> {
  console.log(`Seeding ${RSS_FEED_ITEM_SEED_COUNT} semantic RSS feed items...`)
  {
    await using transaction = await beginTransaction()
    await seedSemanticStories(transaction)
    await attachSemanticVectorsAndStories(transaction)

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
  // Keep point and relation lookups selective against a representative story corpus.
  // These stories intentionally have no post, RSS item, or official-item links.
  for (let index = 0; index < UNLINKED_STORY_COUNT; index++) {
    values.push(seedUuid(300_000 + index, '17'), `Seed unlinked story ${index}`)
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
  await query(`/* seedExplainData */ DROP INDEX ${HNSW_INDEX}`)
  await query(
    `/* seedExplainData */ WITH semantic_items AS (
       SELECT ids.id, row_number() OVER (ORDER BY ids.id)::int - 1 AS row_index
       FROM rss_feed_item_guids ids
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
       CASE
         WHEN semantic_items.row_index < $4 THEN
           ARRAY[1::real, semantic_items.row_index::real / 10000]
           || array_fill(0::real, ARRAY[1022])
         WHEN semantic_items.row_index % 20 = 0 THEN
           ARRAY[1::real, semantic_items.row_index::real / 100000]
           || array_fill(0::real, ARRAY[1022])
         ELSE
           ARRAY[0.15::real, 0.25::real]
           || ARRAY(
             SELECT sin(semantic_items.row_index * coordinate::double precision)::real
             FROM generate_series(1, 30) AS coordinate
           )
           || array_fill(0::real, ARRAY[992])
       END
     )::vector(1024),
     story_id = semantic_stories.id
     FROM semantic_items
     LEFT JOIN semantic_stories
       ON semantic_stories.story_index = (semantic_items.row_index - $5) / 2
      AND semantic_items.row_index >= $5
      AND semantic_items.row_index < $4
     WHERE items.id = semantic_items.id`,
    [
      RSS_FEED_ITEM_SEED_COUNT,
      seedUuid(100_000, '17'),
      seedUuid(100_000 + SEMANTIC_STORY_PAIR_COUNT, '17'),
      SEMANTIC_COHORT_COUNT,
      SEMANTIC_STORY_START_INDEX,
    ],
  )
  await query(`/* seedExplainData */ SET LOCAL maintenance_work_mem = '512MB'`)
  await query(`/* seedExplainData */ SET LOCAL max_parallel_maintenance_workers = 0`)
  await query(
    `/* seedExplainData */ CREATE INDEX ${HNSW_INDEX}
     ON rss_feed_items USING hnsw (bedrock_nova_multimodal_v1_embedding vector_cosine_ops)
     WHERE bedrock_nova_multimodal_v1_embedding IS NOT NULL`,
  )
}
