import { HNSW_SEARCH_BASE_SETTINGS } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import { getTopicsWorkLimit, SEMANTIC_TOPIC_CANDIDATE_MAX } from '../work-limits.mts'
import type { TopicSearchOptions } from './types.mts'
import type { TopicSearchState, TopicSemanticAnchorCte } from './query-builder-state.mts'
import { appendTopicSearchWhere, buildTopicSearchBaseWhereClauses } from './query-builder-where.mts'

/**
 * `hnsw.ef_search` stays at `40` (matching semantic RSS search): with `iterative_scan =
 * relaxed_order` and `max_scan_tuples = 20000`, pgvector resumes graph traversal past the initial
 * 40-entry list to fill the `LIMIT k` prefix while keeping HNSW cost below a sequential scan on
 * 40k-row topic corpora in both custom and generic plans.
 */
export const SEMANTIC_TOPIC_SEARCH_SETTINGS = {
  ...HNSW_SEARCH_BASE_SETTINGS,
  'hnsw.ef_search': '40',
} as const

function getSemanticTopicCandidateLimit(): number {
  const candidateLimit = getTopicsWorkLimit('semantic_topic_candidate_limit')
  if (
    !Number.isSafeInteger(candidateLimit) ||
    candidateLimit < 1 ||
    candidateLimit > SEMANTIC_TOPIC_CANDIDATE_MAX
  ) {
    throw new Error('Invalid semantic topic candidate limit')
  }
  return candidateLimit
}

function appendAnchorFromClause(query: SQLStatement, anchor: TopicSemanticAnchorCte): void {
  switch (anchor) {
    case 'semantic_search_embedding':
      query.append(sql`semantic_search_embedding`)
      return
    case 'similar_topic_embedding':
      query.append(sql`similar_topic_embedding`)
      return
    case 'similar_post_embedding':
      query.append(sql`similar_post_embedding`)
      return
    case 'similar_rss_feed_item_embedding':
      query.append(sql`similar_rss_feed_item_embedding`)
      break
  }
}

/**
 * Vector search carve-out in `.agents/skills/vouchington-postgres/SKILL.md` (Query shape):
 * pgvector requires an HNSW k-nearest prefix (`ORDER BY <=> LIMIT k`) with a bounded DynamicConfig
 * `k` and hard maximum bound in SQL (#6752).
 */
export function buildSemanticTopicNearestCte(
  options: TopicSearchOptions,
  state: TopicSearchState,
): SQLStatement {
  const anchor = state.semanticAnchorCte
  if (!anchor) throw new Error('buildSemanticTopicNearestCte requires an active semantic signal')

  const candidateLimit = getSemanticTopicCandidateLimit()
  const baseWhereClauses = buildTopicSearchBaseWhereClauses(options, state)
  const query = sql`semantic_nearest AS MATERIALIZED (`

  if (anchor === 'semantic_search_embedding') {
    query.append(sql`
      SELECT
        t.id,
        t.name,
        t.slug,
        t.topic_type,
        t.created_at`)
    if (state.hasSecondarySemanticSignal) {
      query.append(sql`,
        t.bedrock_nova_multimodal_v1_embedding`)
    }
    query.append(sql`,
        (t.bedrock_nova_multimodal_v1_embedding <=> semantic_search_embedding.embedding) AS embedding_distance
      FROM topics t
      CROSS JOIN semantic_search_embedding`)
    appendTopicSearchWhere(query, baseWhereClauses)
    // Both integers are validated constants so PostgreSQL folds LEAST(k, max) before generic
    // planning and prices the HNSW index accurately while still binding the hard max in SQL.
    query
      .append(sql`
      ORDER BY t.bedrock_nova_multimodal_v1_embedding <=> semantic_search_embedding.embedding
      LIMIT LEAST(`)
      .append(String(candidateLimit))
      .append(sql`, `)
      .append(String(SEMANTIC_TOPIC_CANDIDATE_MAX)).append(sql`)
    )`)
    return query
  }

  query.append(sql`
      SELECT
        nearest.id,
        nearest.name,
        nearest.slug,
        nearest.topic_type,
        nearest.created_at`)
  if (state.hasSecondarySemanticSignal) {
    query.append(sql`,
        nearest.bedrock_nova_multimodal_v1_embedding`)
  }
  query.append(sql`,
        nearest.embedding_distance
      FROM `)
  appendAnchorFromClause(query, anchor)
  query.append(sql` anchor_embedding
      CROSS JOIN LATERAL (
        SELECT
          t.id,
          t.name,
          t.slug,
          t.topic_type,
          t.created_at`)
  if (state.hasSecondarySemanticSignal) {
    query.append(sql`,
          t.bedrock_nova_multimodal_v1_embedding`)
  }
  query.append(sql`,
          (t.bedrock_nova_multimodal_v1_embedding <=> anchor_embedding.embedding) AS embedding_distance
        FROM topics t`)
  appendTopicSearchWhere(query, baseWhereClauses)
  query
    .append(sql`
        ORDER BY t.bedrock_nova_multimodal_v1_embedding <=> anchor_embedding.embedding
        LIMIT LEAST(`)
    .append(String(candidateLimit))
    .append(sql`, `)
    .append(String(SEMANTIC_TOPIC_CANDIDATE_MAX)).append(sql`)
      ) nearest
    )`)
  return query
}
