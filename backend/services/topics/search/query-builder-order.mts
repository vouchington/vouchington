import type { TopicSearchOptions, TopicSearchSort } from './types.mts'
import type { TopicSearchState } from './query-builder-state.mts'
import sql, { type SQLStatement } from 'sql-template-strings'

export function appendTopicSearchOrderAndLimit(
  query: SQLStatement,
  options: TopicSearchOptions,
  sort: TopicSearchSort,
  state: TopicSearchState,
) {
  if (sort === 'relevance' && state.hasTextSearch) {
    query.append(sql`
    ORDER BY
      tier_calc.relevance_tier ASC,
      t.id DESC`)
  } else if (state.useSemanticRelevanceRanking) {
    query.append(sql`
    ORDER BY ranking_score DESC, t.id DESC`)
  } else if (sort === 'new' || sort === 'relevance') {
    query.append(sql`
    ORDER BY t.id DESC`)
  } else if (sort === 'best') {
    query.append(sql`
    ORDER BY COALESCE(tm.ratings__score__sort, 0) DESC, t.id DESC`)
  }

  if (!options.omitLimit) {
    query.append(sql`
    LIMIT ${options.limit ?? 100}`)
  }
}
