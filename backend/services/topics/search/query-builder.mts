import type { TopicSearchOptions, TopicSearchSort } from './types.mts'
import pgvector from 'pgvector/pg'
import sql, { type SQLStatement } from 'sql-template-strings'
import { buildEmbeddingCtes } from '@modules/search-utils'
import { appendTopicSearchOrderAndLimit } from './query-builder-order.mts'
import { appendTopicSearchJoins, appendTopicSearchSelect } from './query-builder-select.mts'
import { getTopicSearchState } from './query-builder-state.mts'
import { appendTopicSearchWhere, buildTopicSearchWhereClauses } from './query-builder-where.mts'

export function buildTopicSearchQuery(
  options: TopicSearchOptions,
  sort: TopicSearchSort,
): SQLStatement {
  const state = getTopicSearchState(options, sort)

  const ctes: SQLStatement[] = buildEmbeddingCtes({
    semanticSearchEmbeddingVector:
      state.hasSemanticSearch && options.semanticSearchEmbedding
        ? (pgvector.toSql(options.semanticSearchEmbedding) ?? undefined)
        : undefined,
    similar_post_id: options.similar_post_id,
    similar_topic_id: options.similar_topic_id,
    similar_rss_feed_item_id: options.similar_rss_feed_item_id,
  })

  const query = sql`/* buildTopicSearchQuery */`
  if (ctes.length > 0) {
    query.append(sql`WITH `)
    ctes.forEach((cte, index) => {
      if (index > 0) query.append(sql`,\n      `)
      query.append(cte)
    })
    query.append(sql`\n    `)
  }

  appendTopicSearchSelect(query, sort, state)
  appendTopicSearchJoins(query, options, sort, state)
  appendTopicSearchWhere(query, buildTopicSearchWhereClauses(options, sort, state))
  appendTopicSearchOrderAndLimit(query, options, sort, state)

  return query
}
