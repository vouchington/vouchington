import type { ToolsTopicSearchResult } from './types.mts'
import { getCachedSearchEmbedding } from '@services/bedrock-embeddings/search'
import { read } from '@data-stores/psql'
import pgvector from 'pgvector/pg'
import sql from 'sql-template-strings'

type ToolsSearchTopicsSemanticDependencies = {
  getCachedSearchEmbedding: typeof getCachedSearchEmbedding
}

const defaultToolsSearchTopicsSemanticDependencies: ToolsSearchTopicsSemanticDependencies = {
  getCachedSearchEmbedding,
}

export async function toolsSearchTopicsSemantic(
  query: string,
  limit: number,
  dependencies: ToolsSearchTopicsSemanticDependencies = defaultToolsSearchTopicsSemanticDependencies,
): Promise<ToolsTopicSearchResult[]> {
  const safeLimit = Math.min(Math.max(1, limit), 25)

  // Get embedding for the query (cached in Valkey, consistent with posts semantic search)
  const embedding = await dependencies.getCachedSearchEmbedding(query)

  // Search topics by semantic similarity
  const embeddingVector = pgvector.toSql(embedding)
  const queryStatement = sql`/* toolsSearchTopicsSemantic */
    SELECT
      t.id,
      t.name,
      t.slug,
      t.topic_type::text AS topic_type,
      (1.0 / (1.0 + (t.bedrock_nova_multimodal_v1_embedding <=> ${embeddingVector}::vector))) AS similarity_score
    FROM topics t
    WHERE t.deleted_at IS NULL
      AND t.merged_into_topic_id IS NULL
      AND t.bedrock_nova_multimodal_v1_embedding IS NOT NULL
      AND (t.bedrock_nova_multimodal_v1_embedding <=> ${embeddingVector}::vector) < 0.75
    ORDER BY similarity_score DESC
    LIMIT ${safeLimit}
  `

  const { rows } = await read(queryStatement)

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    topic_type: row.topic_type,
  }))
}
