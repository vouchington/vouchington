import type { ToolsTopicSearchResult } from './types.mts'
import { getCachedSearchEmbedding } from '@services/bedrock-embeddings/search'
import { HNSW_SEARCH_BASE_SETTINGS, readWithHnswSettings } from '@data-stores/psql'
import {
  buildEmbeddingCtes,
  buildSemanticDistanceScore,
  EMBEDDING_DISTANCE_THRESHOLD,
} from '@modules/search-utils'
import pgvector from 'pgvector/pg'
import sql from 'sql-template-strings'
import { getTopicsWorkLimit, TOOLS_SEMANTIC_TOPIC_CANDIDATE_MAX } from '../work-limits.mts'

/**
 * `hnsw.ef_search` stays at `40` (matching semantic RSS search): with `iterative_scan =
 * relaxed_order` and `max_scan_tuples = 20000`, pgvector resumes graph traversal past the initial
 * 40-entry list to fill the `LIMIT k` prefix while keeping HNSW cost below a parallel sequential
 * scan on 40k-row topic corpora in both custom and generic plans.
 */
export const TOOLS_SEMANTIC_TOPIC_SEARCH_SETTINGS = {
  ...HNSW_SEARCH_BASE_SETTINGS,
  'hnsw.ef_search': '40',
} as const

function getToolsSemanticTopicCandidateLimit(): number {
  const candidateLimit = getTopicsWorkLimit('tools_semantic_topic_candidate_limit')
  if (!Number.isSafeInteger(candidateLimit) || candidateLimit < 1) {
    throw new Error('Invalid tools semantic topic candidate limit')
  }
  return candidateLimit
}

export async function toolsSearchTopicsByEmbedding(
  embedding: number[],
  limit: number,
): Promise<ToolsTopicSearchResult[]> {
  const safeLimit = Math.min(Math.max(1, limit), 25)
  const candidateLimit = getToolsSemanticTopicCandidateLimit()
  const embeddingVector = pgvector.toSql(embedding)
  if (!embeddingVector) {
    throw new Error('Invalid search embedding vector')
  }

  const embeddingCtes = buildEmbeddingCtes({
    semanticSearchEmbeddingVector: embeddingVector,
  })
  const queryStatement = sql`/* toolsSearchTopicsSemantic */
    WITH `
  embeddingCtes.forEach((cte, index) => {
    if (index > 0) queryStatement.append(sql`, `)
    queryStatement.append(cte)
  })
  // Vector search carve-out in .agents/skills/vouchington-postgres/SKILL.md (Query shape):
  // pgvector requires an HNSW k-nearest prefix (ORDER BY <=> LIMIT k) with a bounded DynamicConfig
  // k and hard maximum bound in SQL (#6770). Both integers are validated constants so PostgreSQL
  // folds LEAST(k, max) before generic planning and prices the HNSW index accurately.
  queryStatement
    .append(sql`, semantic_nearest AS MATERIALIZED (
      SELECT
        t.id,
        t.name,
        t.slug,
        t.topic_type::text AS topic_type,
        (t.bedrock_nova_multimodal_v1_embedding <=> semantic_search_embedding.embedding) AS embedding_distance
      FROM topics t
      CROSS JOIN semantic_search_embedding
      WHERE t.deleted_at IS NULL
        AND t.merged_into_topic_id IS NULL
        AND t.bedrock_nova_multimodal_v1_embedding IS NOT NULL
      ORDER BY t.bedrock_nova_multimodal_v1_embedding <=> semantic_search_embedding.embedding
      LIMIT LEAST(`)
    .append(String(candidateLimit))
    .append(sql`, `)
    .append(String(TOOLS_SEMANTIC_TOPIC_CANDIDATE_MAX)).append(sql`)
    )
    SELECT
      t.id,
      t.name,
      t.slug,
      t.topic_type,
      `)
  queryStatement.append(buildSemanticDistanceScore('t.embedding_distance'))
    .append(sql` AS similarity_score
    FROM semantic_nearest t
    WHERE t.embedding_distance < ${EMBEDDING_DISTANCE_THRESHOLD}
    ORDER BY similarity_score DESC
    LIMIT ${safeLimit}
  `)

  const { rows } = await readWithHnswSettings<
    ToolsTopicSearchResult & { similarity_score: number }
  >(queryStatement, TOOLS_SEMANTIC_TOPIC_SEARCH_SETTINGS)

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    topic_type: row.topic_type,
  }))
}

export async function toolsSearchTopicsSemantic(
  query: string,
  limit: number,
): Promise<ToolsTopicSearchResult[]> {
  // Get embedding for the query (cached in Valkey, consistent with posts semantic search)
  const embedding = await getCachedSearchEmbedding(query)
  return toolsSearchTopicsByEmbedding(embedding, limit)
}
