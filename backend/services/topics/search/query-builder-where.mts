import type { TopicSearchOptions, TopicSearchSort } from './types.mts'
import type { TopicSearchState } from './query-builder-state.mts'
import { buildTopicSemanticRankingScoreSql, escapeLikePattern } from './query-builder-utils.mts'
import { EMBEDDING_DISTANCE_THRESHOLD } from '@modules/search-utils'
import sql, { type SQLStatement } from 'sql-template-strings'

export function buildTopicSearchWhereClauses(
  options: TopicSearchOptions,
  sort: TopicSearchSort,
  state: TopicSearchState,
) {
  const whereClauses: SQLStatement[] = [
    sql`t.deleted_at IS NULL`,
    sql`t.merged_into_topic_id IS NULL`,
  ]

  if (state.hasTextSearch) {
    const searchPattern = `%${escapeLikePattern(options.text_search_query!.trim())}%`
    whereClauses.push(sql`(
      t.name ILIKE ${searchPattern} ESCAPE '\\' OR
      t.slug ILIKE ${searchPattern} ESCAPE '\\'
    )`)
  }

  if (options.hashtag_topic_ids && options.hashtag_topic_ids.length > 0) {
    whereClauses.push(sql`t.id = ANY(${options.hashtag_topic_ids})`)
  }

  appendSemanticFilters(whereClauses, options, state)

  if (options.slugs && options.slugs.length > 0) {
    whereClauses.push(sql`t.slug = ANY(${options.slugs})`)
  }

  if (options.topic_types && options.topic_types.length > 0) {
    whereClauses.push(sql`t.topic_type = ANY(${options.topic_types})`)
  }

  if (options.spending_category) {
    whereClauses.push(sql`EXISTS (
      SELECT 1 FROM topics__spending_categories tsc
      WHERE tsc.topic_id = t.id
    )`)
  }

  if (options.rss_feed) {
    whereClauses.push(sql`EXISTS (
      SELECT 1 FROM rss_feeds rf
      WHERE rf.topic_id = t.id
        AND rf.deleted_at IS NULL
    )`)
  }

  appendFediverseInstanceFilters(whereClauses, options)

  appendPaginationFilters(whereClauses, options, sort, state)

  return whereClauses
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

function appendSemanticFilters(
  whereClauses: SQLStatement[],
  options: TopicSearchOptions,
  state: TopicSearchState,
) {
  if (!state.hasSemanticSignal) return

  whereClauses.push(sql`t.bedrock_nova_multimodal_v1_embedding IS NOT NULL`)
  if (state.hasSemanticSearch) {
    whereClauses.push(
      sql`(t.bedrock_nova_multimodal_v1_embedding <=> semantic_search_embedding.embedding) < ${EMBEDDING_DISTANCE_THRESHOLD}`,
    )
  }
  if (state.hasSimilarPostSearch) {
    whereClauses.push(
      sql`(t.bedrock_nova_multimodal_v1_embedding <=> similar_post_embedding.embedding) < ${EMBEDDING_DISTANCE_THRESHOLD}`,
    )
  }
  if (state.hasSimilarTopicSearch) {
    whereClauses.push(
      sql`(t.bedrock_nova_multimodal_v1_embedding <=> similar_topic_embedding.embedding) < ${EMBEDDING_DISTANCE_THRESHOLD}`,
    )
    whereClauses.push(sql`t.id <> ${options.similar_topic_id!}`)
  }
  if (state.hasSimilarRssFeedItemSearch) {
    whereClauses.push(
      sql`(t.bedrock_nova_multimodal_v1_embedding <=> similar_rss_feed_item_embedding.embedding) < ${EMBEDDING_DISTANCE_THRESHOLD}`,
    )
  }
}

function appendFediverseInstanceFilters(whereClauses: SQLStatement[], options: TopicSearchOptions) {
  if (
    !options.fediverse_instance &&
    !options.fediverse_instance_software &&
    options.fediverse_instance_open_registrations === undefined &&
    !options.fediverse_instance_integration_status
  )
    return

  const clause = sql`EXISTS (
      SELECT 1 FROM topics__fediverse_instances tfi
      WHERE tfi.topic_id = t.id`

  if (options.fediverse_instance_software) {
    clause.append(sql` AND LOWER(tfi.software) = LOWER(${options.fediverse_instance_software})`)
  }

  if (options.fediverse_instance_open_registrations !== undefined) {
    clause.append(
      sql` AND tfi.open_registrations = ${options.fediverse_instance_open_registrations}`,
    )
  }

  if (options.fediverse_instance_integration_status) {
    clause.append(
      sql` AND tfi.integration_status = ${options.fediverse_instance_integration_status}`,
    )
  }

  clause.append(sql`
    )`)
  whereClauses.push(clause)
}

function appendPaginationFilters(
  whereClauses: SQLStatement[],
  options: TopicSearchOptions,
  sort: TopicSearchSort,
  state: TopicSearchState,
) {
  if (
    sort === 'relevance' &&
    state.hasTextSearch &&
    options.tier_after !== undefined &&
    options.id_lt
  ) {
    whereClauses.push(sql`(
      tier_calc.relevance_tier > ${options.tier_after}
      OR (tier_calc.relevance_tier = ${options.tier_after} AND t.id < ${options.id_lt})
    )`)
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
    whereClauses.push(rankingCursorFilter)
  } else if (sort === 'best' && options.score_lt !== undefined && options.id_lt !== undefined) {
    whereClauses.push(
      sql`(COALESCE(tm.ratings__score__sort, 0), t.id) < (${options.score_lt}, ${options.id_lt})`,
    )
  } else if (options.id_lt) {
    whereClauses.push(sql`t.id < ${options.id_lt}`)
  }
}
