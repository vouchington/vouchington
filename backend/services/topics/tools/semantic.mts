import type { ToolsTopicSearchResult } from './types.mts'
import { getCachedSearchEmbedding } from '@services/bedrock-embeddings/search'
import { HNSW_SEARCH_DEFAULT_SETTINGS, readWithHnswSettings } from '@data-stores/psql'
import {
  buildEmbeddingCtes,
  buildSemanticDistanceScore,
  buildSemanticNearestCte,
  EMBEDDING_DISTANCE_THRESHOLD,
} from '@modules/search-utils'
import pgvector from 'pgvector/pg'
import sql from 'sql-template-strings'
import { getTopicsWorkLimit, TOOLS_SEMANTIC_TOPIC_CANDIDATE_MAX } from '../work-limits.mts'

export async function toolsSearchTopicsByEmbedding(
  embedding: number[],
  limit: number,
): Promise<ToolsTopicSearchResult[]> {
  const safeLimit = Math.min(Math.max(1, limit), 25)

  const embeddingCtes = buildEmbeddingCtes({
    semanticSearchEmbeddingVector: pgvector.toSql(embedding) ?? undefined,
  })
  const queryStatement = sql`/* toolsSearchTopicsSemantic */
    WITH `
  for (const cte of embeddingCtes) {
    queryStatement.append(cte)
  }
  queryStatement.append(sql`, `).append(
    buildSemanticNearestCte({
      selectColumns: ['t.id', 't.name', 't.slug', 't.topic_type::text AS topic_type'],
      from: 'topics t',
      embeddingColumn: 't.bedrock_nova_multimodal_v1_embedding',
      whereClauses: ['t.deleted_at IS NULL', 't.merged_into_topic_id IS NULL'],
      candidateLimit: getTopicsWorkLimit('tools_semantic_topic_candidate_limit'),
      maxCandidateLimit: TOOLS_SEMANTIC_TOPIC_CANDIDATE_MAX,
    }),
  ).append(sql`
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
  >(queryStatement, HNSW_SEARCH_DEFAULT_SETTINGS)

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
