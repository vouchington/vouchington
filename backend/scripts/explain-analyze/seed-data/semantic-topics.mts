import { beginTransaction } from '@data-stores/psql'
import { TOPIC_SEED_COUNT } from './common.mts'

const HNSW_INDEX = 'idx_topics__bedrock_nova_multimodal_v1_embedding'
const SEMANTIC_COHORT_COUNT = 256

/**
 * Attaches deterministic vectors across the full seeded topic corpus (40k topics) so semantic
 * topic search exercises the HNSW index at realistic capacity. The first 256 rows form a dense
 * near cluster; roughly 5% of the remaining topics match the query vector and 95% are unrelated.
 */
export async function seedSemanticTopics(): Promise<void> {
  console.log(`Seeding ${TOPIC_SEED_COUNT} semantic topics...`)
  await using transaction = await beginTransaction()
  await transaction(`/* seedExplainData */ DROP INDEX ${HNSW_INDEX}`)
  await transaction(
    `/* seedExplainData */ WITH semantic_topics AS (
       SELECT id, row_number() OVER (ORDER BY id)::int - 1 AS row_index
       FROM topics
       WHERE slug LIKE 'seed-topic-%'
       ORDER BY id
       LIMIT $1
     )
     UPDATE topics
     SET bedrock_nova_multimodal_v1_embedding = (
       CASE
         WHEN semantic_topics.row_index < $2 THEN
           ARRAY[1::real, semantic_topics.row_index::real / 10000]
           || array_fill(0::real, ARRAY[1022])
         WHEN semantic_topics.row_index % 20 = 0 THEN
           ARRAY[1::real, semantic_topics.row_index::real / 100000]
           || array_fill(0::real, ARRAY[1022])
         ELSE
           ARRAY[0.15::real, 0.25::real]
           || ARRAY(
             SELECT sin(semantic_topics.row_index * coordinate::double precision)::real
             FROM generate_series(1, 30) AS coordinate
           )
           || array_fill(0::real, ARRAY[992])
       END
     )::vector(1024)
     FROM semantic_topics
     WHERE topics.id = semantic_topics.id`,
    [TOPIC_SEED_COUNT, SEMANTIC_COHORT_COUNT],
  )
  await transaction(`/* seedExplainData */ SET LOCAL maintenance_work_mem = '512MB'`)
  await transaction(`/* seedExplainData */ SET LOCAL max_parallel_maintenance_workers = 0`)
  await transaction(
    `/* seedExplainData */ CREATE INDEX ${HNSW_INDEX}
     ON topics USING hnsw (bedrock_nova_multimodal_v1_embedding vector_cosine_ops)
     WHERE bedrock_nova_multimodal_v1_embedding IS NOT NULL`,
  )
  await transaction.commit()
}
