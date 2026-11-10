import sql, { type SQLStatement } from 'sql-template-strings'
import { buildPostRankingScoreExpression } from '@services/posts/search/query-builder-utils'
import type { PostSearchOptions } from '@services/posts/search/types'
import { buildPostSearchCtes, appendCtes } from '@services/posts/search/query-builder/ctes'
import { appendPostSearchOrderAndLimit } from '@services/posts/search/query-builder/order-and-limit'
import { appendPostSearchSelectAndJoins } from '@services/posts/search/query-builder/select-and-joins'
import { appendPostSearchWhereClause } from '@services/posts/search/query-builder/where-clause'
import { buildPostSearchTimeRangeFilter } from '@services/posts/search/hacker-news-hot-options'

/**
 * Build the former canonical URL join predicate for EXPLAIN comparison only. This preserves the
 * predicate from 87b9b98c71 / b97f3a2b43 under the current search eligibility and cursor.
 * It is not imported by application code and is not a legacy runtime path.
 */
function buildHistoricalHackerNewsPredicate(): SQLStatement {
  const hasReferences = sql`(totals.story_count > 0 OR totals.comment_count > 0)`
  const direct = sql`EXISTS (
    SELECT 1
    FROM (
      SELECT COALESCE(hop.canonical_url_id, source.canonical_url_id, source.id) AS canonical_id
      FROM urls source
      LEFT JOIN urls hop ON hop.id = source.canonical_url_id
      WHERE source.id = posts.url_id
    ) resolved
    JOIN url_hacker_news_totals totals ON totals.url_id = resolved.canonical_id
    WHERE `
  direct.append(hasReferences).append(sql`
  )`)

  const related = sql`EXISTS (
    SELECT 1
    FROM "relation__post__related__url" rel
    JOIN LATERAL (
      SELECT COALESCE(hop.canonical_url_id, source.canonical_url_id, source.id) AS canonical_id
      FROM urls source
      LEFT JOIN urls hop ON hop.id = source.canonical_url_id
      WHERE source.id = rel.object_id
    ) resolved ON true
    JOIN url_hacker_news_totals totals ON totals.url_id = resolved.canonical_id
    WHERE rel.subject_id = posts.id
      AND rel.deleted_at IS NULL
      AND rel.votes_score_net > 0
      AND `
  related.append(hasReferences).append(sql`
  )`)

  return sql`(`
    .append(direct)
    .append(sql` OR `)
    .append(related)
    .append(sql`)`)
}

/**
 * Compose an anonymous HN post-search query around the historical join predicate. The accepted
 * options are the scale matrix's ordinary HN query options plus the decoded page cursor. Keep this
 * builder narrow so the comparison can't silently diverge for semantic or unrelated filters.
 */
export function buildHackerNewsScaleReference(
  options: PostSearchOptions,
  decisionInstant: Date,
): SQLStatement {
  if (options.has_hacker_news_references !== true)
    throw new Error('The HN scale reference requires has_hacker_news_references=true')
  if (options.time_range !== '1y' && options.time_range !== 'all')
    throw new Error('The HN scale reference supports only the one-year and all-time windows')
  if (options.limit !== 26)
    throw new Error('The HN scale reference requires the same 26-row search page')
  if (options.omitLimit || options.omitOrderBy)
    throw new Error('The HN scale reference requires the normal ordered page query')

  const unsupported = [
    options.text_search_query,
    options.semantic_search_query,
    options.semanticSearchEmbedding,
    options.similar_post_id,
    options.similar_topic_id,
    options.similar_rss_feed_item_id,
  ]
  if (unsupported.some(value => value !== undefined))
    throw new Error('The HN scale reference does not support text, semantic, or similarity search')

  const rawSort = options.sort ?? 'new'
  const sort = rawSort === 'following_new' ? 'new' : rawSort
  if (sort !== 'new' && sort !== 'best' && sort !== 'hot')
    throw new Error(`Unsupported HN scale reference sort: ${sort}`)

  const hasText = false
  const hasSemantic = false
  const rankingScoreExpression = buildPostRankingScoreExpression({
    hasTextSearch: hasText,
    hasSemanticSearch: hasSemantic,
  })
  const noHackerNewsFlag = { ...options, has_hacker_news_references: undefined }
  const ctes = buildPostSearchCtes({
    ...options,
    hasTextSearch: hasText,
    hasSemanticSearch: hasSemantic,
  })
  const query = sql`/* buildHackerNewsScaleJoinReference */\n`

  appendCtes(query, ctes)
  appendPostSearchSelectAndJoins(query, {
    decisionInstant,
    currentUser: undefined,
    followingRankExpression: null,
    hasSemanticSearch: hasSemantic,
    hasTextSearch: hasText,
    options: noHackerNewsFlag,
    rankingScoreExpression,
    sort,
    useSemanticCandidates: hasSemantic,
  })
  appendPostSearchWhereClause(query, {
    decisionInstant,
    currentUser: undefined,
    followingRankExpression: null,
    hasSemanticSearch: hasSemantic,
    hasTextSearch: hasText,
    options: noHackerNewsFlag,
    rankingScoreExpression,
    sort,
  })
  query.append(sql`\n      AND `).append(buildHistoricalHackerNewsPredicate())
  // The stored flag is omitted so this comparison is the historical join. Hot still uses the
  // same thirty-day window as the current Hacker News hot walk.
  if (sort === 'hot') {
    const hotWindow = buildPostSearchTimeRangeFilter(options, 'posts.id', decisionInstant)
    if (hotWindow) query.append(sql`\n      AND `).append(hotWindow)
  }
  appendPostSearchOrderAndLimit(query, {
    followingRankExpression: null,
    hasSemanticSearch: hasSemantic,
    hasTextSearch: hasText,
    limit: options.limit,
    omitLimit: false,
    omitOrderBy: false,
    sort,
  })
  return query
}
