import { buildSemanticNearestCte } from '@modules/search-utils'
import type { SQLStatement } from 'sql-template-strings'
import { getTopicsWorkLimit, SEMANTIC_TOPIC_CANDIDATE_MAX } from '../work-limits.mts'
import type { TopicSearchOptions } from './types.mts'
import type { TopicSearchState } from './query-builder-state.mts'
import { buildTopicSearchBaseWhereClauses } from './query-builder-where.mts'

const BASE_SELECT_COLUMNS = ['t.id', 't.name', 't.slug', 't.topic_type', 't.created_at'] as const
const BASE_OUTER_SELECT_COLUMNS = [
  'nearest.id',
  'nearest.name',
  'nearest.slug',
  'nearest.topic_type',
  'nearest.created_at',
] as const

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

  const selectColumns = state.hasSecondarySemanticSignal
    ? [...BASE_SELECT_COLUMNS, 't.bedrock_nova_multimodal_v1_embedding']
    : BASE_SELECT_COLUMNS
  const outerSelectColumns = state.hasSecondarySemanticSignal
    ? [...BASE_OUTER_SELECT_COLUMNS, 'nearest.bedrock_nova_multimodal_v1_embedding']
    : BASE_OUTER_SELECT_COLUMNS

  return buildSemanticNearestCte({
    selectColumns,
    from: 'topics t',
    embeddingColumn: 't.bedrock_nova_multimodal_v1_embedding',
    whereClauses: buildTopicSearchBaseWhereClauses(options, state),
    candidateLimit: getTopicsWorkLimit('semantic_topic_candidate_limit'),
    maxCandidateLimit: SEMANTIC_TOPIC_CANDIDATE_MAX,
    ...(anchor === 'semantic_search_embedding'
      ? {}
      : { lateralAnchor: { cte: anchor, outerSelectColumns } }),
  })
}
