import type { TopicSearchOptions, TopicSearchSort } from './types.mts'
import type { TopicSearchState } from './query-builder-state.mts'
import { buildTopicSemanticRankingScoreSql, escapeLikePattern } from './query-builder-utils.mts'
import sql, { type SQLStatement } from 'sql-template-strings'

export function appendTopicSearchSelect(
  query: SQLStatement,
  sort: TopicSearchSort,
  state: TopicSearchState,
) {
  query.append(sql`SELECT
      t.id,
      t.name,
      t.slug,
      t.topic_type,
      t.created_at`)

  if (sort === 'best') {
    query.append(sql`,
      COALESCE(tm.ratings__score__sort, 0) AS sort_score`)
  } else if (sort === 'relevance' && state.hasTextSearch) {
    query.append(sql`,
      tier_calc.relevance_tier`)
  } else if (state.useSemanticRelevanceRanking) {
    query.append(sql`,
      `)
    query.append(buildTopicSemanticRankingScoreSql(state))
    query.append(sql` AS ranking_score`)
  }

  query.append(sql`
    FROM topics t
  `)
}

export function appendTopicSearchJoins(
  query: SQLStatement,
  options: TopicSearchOptions,
  sort: TopicSearchSort,
  state: TopicSearchState,
) {
  if (sort === 'best') {
    query.append(sql`
    LEFT JOIN topic_metrics tm ON tm.topic_id = t.id`)
  }

  appendTopicSearchEmbeddingJoins(query, state)

  if (sort === 'relevance' && state.hasTextSearch) {
    const trimmedTextSearchQuery = options.text_search_query!.trim()
    const escaped = escapeLikePattern(trimmedTextSearchQuery)
    query.append(sql`
    CROSS JOIN LATERAL (
      SELECT
        CASE
          WHEN LOWER(t.name) = LOWER(${trimmedTextSearchQuery}) THEN 0
          WHEN (
            t.name ILIKE ${escaped} || '%' ESCAPE '\\'
            OR t.slug ILIKE ${escaped} || '%' ESCAPE '\\'
          ) THEN 1
          ELSE 2
        END AS relevance_tier
    ) AS tier_calc
    `)
  }
}

function appendTopicSearchEmbeddingJoins(query: SQLStatement, state: TopicSearchState) {
  if (state.hasSemanticSearch) {
    query.append(sql`
    CROSS JOIN semantic_search_embedding`)
  }
  if (state.hasSimilarPostSearch) {
    query.append(sql`
    CROSS JOIN similar_post_embedding`)
  }
  if (state.hasSimilarTopicSearch) {
    query.append(sql`
    CROSS JOIN similar_topic_embedding`)
  }
  if (state.hasSimilarRssFeedItemSearch) {
    query.append(sql`
    CROSS JOIN similar_rss_feed_item_embedding`)
  }
}
