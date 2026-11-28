import type { TopicSearchOptions, TopicSearchSort } from './types.mts'
import type { TopicSearchState, TopicSemanticAnchorCte } from './query-builder-state.mts'
import { buildTopicSemanticRankingScoreSql, escapeLikePattern } from './query-builder-utils.mts'
import { EMBEDDING_DISTANCE_THRESHOLD } from '@modules/search-utils'
import sql, { type SQLStatement } from 'sql-template-strings'

export function buildTopicSearchBaseWhereClauses(
  options: TopicSearchOptions,
  state: TopicSearchState,
): SQLStatement[] {
  const searchPattern = state.hasTextSearch
    ? `%${escapeLikePattern(options.text_search_query!.trim())}%`
    : null
  return [
    sql`t.deleted_at IS NULL`,
    sql`t.merged_into_topic_id IS NULL`,
    ...(searchPattern === null
      ? []
      : [
          sql`(
      t.name ILIKE ${searchPattern} ESCAPE '\\' OR
      t.slug ILIKE ${searchPattern} ESCAPE '\\'
    )`,
        ]),
    ...(options.hashtag_topic_ids && options.hashtag_topic_ids.length > 0
      ? [sql`t.id = ANY(${options.hashtag_topic_ids})`]
      : []),
    ...(state.hasSemanticSignal ? [sql`t.bedrock_nova_multimodal_v1_embedding IS NOT NULL`] : []),
    ...(state.hasSimilarTopicSearch ? [sql`t.id <> ${options.similar_topic_id!}`] : []),
    ...(options.slugs && options.slugs.length > 0 ? [sql`t.slug = ANY(${options.slugs})`] : []),
    ...(options.topic_types && options.topic_types.length > 0
      ? [sql`t.topic_type = ANY(${options.topic_types})`]
      : []),
    ...(options.spending_category
      ? [
          sql`EXISTS (
      SELECT 1 FROM spending_category_topics tsc
      WHERE tsc.topic_id = t.id
    )`,
        ]
      : []),
    ...(options.rss_feed
      ? [
          sql`EXISTS (
      SELECT 1 FROM rss_feeds rf
      WHERE rf.topic_id = t.id
        AND rf.deleted_at IS NULL
    )`,
        ]
      : []),
    ...fediverseInstanceFilters(options),
  ]
}

export function buildTopicSearchWhereClauses(
  options: TopicSearchOptions,
  sort: TopicSearchSort,
  state: TopicSearchState,
): SQLStatement[] {
  if (state.hasSemanticSignal) {
    return [
      sql`t.embedding_distance < ${EMBEDDING_DISTANCE_THRESHOLD}`,
      ...state.secondarySemanticCtes.map(secondaryDistanceThresholdClause),
      ...paginationFilters(options, sort, state),
    ]
  }
  return [
    ...buildTopicSearchBaseWhereClauses(options, state),
    ...paginationFilters(options, sort, state),
  ]
}

export function appendTopicSearchWhere(query: SQLStatement, whereClauses: SQLStatement[]) {
  if (whereClauses.length === 0) return

  query.append(sql`
    WHERE `)
  whereClauses.forEach((clause, index) => {
    if (index > 0)
      query.append(sql`
      AND `)
    query.append(clause)
  })
}

function secondaryDistanceThresholdClause(cte: TopicSemanticAnchorCte): SQLStatement {
  switch (cte) {
    case 'semantic_search_embedding':
      return sql`(t.bedrock_nova_multimodal_v1_embedding <=> semantic_search_embedding.embedding) < ${EMBEDDING_DISTANCE_THRESHOLD}`
    case 'similar_topic_embedding':
      return sql`(t.bedrock_nova_multimodal_v1_embedding <=> similar_topic_embedding.embedding) < ${EMBEDDING_DISTANCE_THRESHOLD}`
    case 'similar_post_embedding':
      return sql`(t.bedrock_nova_multimodal_v1_embedding <=> similar_post_embedding.embedding) < ${EMBEDDING_DISTANCE_THRESHOLD}`
    case 'similar_rss_feed_item_embedding':
      return sql`(t.bedrock_nova_multimodal_v1_embedding <=> similar_rss_feed_item_embedding.embedding) < ${EMBEDDING_DISTANCE_THRESHOLD}`
  }
}

function fediverseInstanceFilters(options: TopicSearchOptions): SQLStatement[] {
  if (
    !options.fediverse_instance &&
    !options.fediverse_instance_software &&
    options.fediverse_instance_open_registrations === undefined &&
    !options.fediverse_instance_integration_status
  )
    return []

  const clause = sql`EXISTS (
      SELECT 1 FROM fediverse_instance_topics tfi
      WHERE tfi.topic_id = t.id`

  if (options.fediverse_instance_software) {
    clause.append(sql` AND LOWER(tfi.software) = LOWER(${options.fediverse_instance_software})`)
  }

  if (options.fediverse_instance_open_registrations !== undefined) {
    clause.append(
      sql` AND tfi.is_open_for_registrations = ${options.fediverse_instance_open_registrations}`,
    )
  }

  if (options.fediverse_instance_integration_status) {
    clause.append(
      sql` AND tfi.integration_status = ${options.fediverse_instance_integration_status}`,
    )
  }

  clause.append(sql`
    )`)
  return [clause]
}

function paginationFilters(
  options: TopicSearchOptions,
  sort: TopicSearchSort,
  state: TopicSearchState,
): SQLStatement[] {
  if (
    sort === 'relevance' &&
    state.hasTextSearch &&
    options.tier_after !== undefined &&
    options.id_lt
  ) {
    return [
      sql`(
      tier_calc.relevance_tier > ${options.tier_after}
      OR (tier_calc.relevance_tier = ${options.tier_after} AND t.id < ${options.id_lt})
    )`,
    ]
  } else if (
    state.useSemanticRelevanceRanking &&
    options.ranking_lt !== undefined &&
    options.id_lt !== undefined
  ) {
    const rankingCursorFilter = sql`(
      `
    rankingCursorFilter.append(buildTopicSemanticRankingScoreSql(state))
    rankingCursorFilter.append(sql`,
      t.id
    ) < (${options.ranking_lt}, ${options.id_lt})`)
    return [rankingCursorFilter]
  } else if (sort === 'best' && options.score_lt !== undefined && options.id_lt !== undefined) {
    return [
      sql`(COALESCE(tm.ratings__score__sort, 0), t.id) < (${options.score_lt}, ${options.id_lt})`,
    ]
  } else if (options.id_lt) {
    return [sql`t.id < ${options.id_lt}`]
  }
  return []
}
