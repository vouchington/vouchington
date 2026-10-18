import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

const HNSW_INDEX = 'idx_posts__bedrock_nova_multimodal_v1_embedding'
const SEMANTIC_POST_COUNT = 40_000

/**
 * Representative vector corpus: about five percent of 40k rows match the query threshold.
 *
 * One set-based UPDATE fills every embedding while the HNSW index is dropped, then one bulk
 * build recreates the identical index with enough maintenance memory to hold the graph.
 * Per-tuple graph inserts cost about 1.2s per 1000 rows (about 50s for the corpus); the
 * bulk build over the same rows takes about 12s.
 */
export async function seedSemanticPosts(): Promise<void> {
  const ids = Array.from({ length: SEMANTIC_POST_COUNT }, (_, index) => seedUuid(index, '05'))
  await using transaction = await beginTransaction()
  await transaction(`/* seedSemanticPosts */ DROP INDEX ${HNSW_INDEX}`)
  await transaction(
    `/* seedSemanticPosts */
    UPDATE posts
    SET bedrock_nova_multimodal_v1_embedding = (
      ARRAY[CASE WHEN seed.ordinal % 20 = 0 THEN 1::real ELSE 0.15::real END,
        1::real + seed.ordinal::real / 100000]
      || ARRAY(
        SELECT (sin(seed.ordinal * coordinate::double precision)
          * CASE WHEN seed.ordinal % 20 = 0 THEN 0.02 ELSE 1 END)::real
        FROM generate_series(1, 30) AS coordinate
      )
      || array_fill(0::real, ARRAY[992])
    )::vector(1024)
    FROM unnest($1::uuid[]) WITH ORDINALITY AS seed(id, ordinal)
    WHERE posts.id = seed.id
  `,
    [ids],
  )
  await transaction(`/* seedSemanticPosts */ SET LOCAL maintenance_work_mem = '512MB'`)
  await transaction(
    `/* seedSemanticPosts */ CREATE INDEX ${HNSW_INDEX}
     ON posts USING hnsw (bedrock_nova_multimodal_v1_embedding vector_cosine_ops)
     WHERE bedrock_nova_multimodal_v1_embedding IS NOT NULL`,
  )
  await transaction.commit()
}
