import type { ExplainResult } from '@data-stores/psql'

export function assertRssFeedCandidatesAreSetBased(result: ExplainResult): void {
  if (!result.scenario_id?.startsWith('rss-feed-item-feed')) return
  const query = result.query_text
  const hasSourceHeadLimit =
    /FROM\s+rss_feed_item_sources\s+WHERE\s+rss_feed_id\s*=[\s\S]*?ORDER\s+BY\s+item_sort_at\s+DESC,\s*rss_feed_item_id\s+DESC\s+LIMIT\s+1\b/i.test(
      query,
    )
  const hasTopicHeadLimit =
    /FROM\s+rss_feed_item_topic_candidates\s+WHERE\s+topic_id\s*=[\s\S]*?ORDER\s+BY\s+sort_at\s+DESC,\s*rss_feed_item_id\s+DESC\s+LIMIT\s+1\b/i.test(
      query,
    )
  const hasSourceChildLimit =
    /FROM\s+rss_feed_item_sources\s+source\s+WHERE\s+source\.rss_feed_id\s*=\s*selected\.source_id[\s\S]*?ORDER\s+BY\s+source\.item_sort_at\s+DESC,\s*source\.rss_feed_item_id\s+DESC\s+LIMIT\s+\$\d+/i.test(
      query,
    )
  const hasTopicChildLimit =
    /FROM\s+rss_feed_item_topic_candidates\s+candidate\s+WHERE\s+candidate\.topic_id\s*=\s*selected\.source_id[\s\S]*?ORDER\s+BY\s+candidate\.sort_at\s+DESC,\s*candidate\.rss_feed_item_id\s+DESC\s+LIMIT\s+\$\d+/i.test(
      query,
    )
  const hasSourceRanking =
    /active_rss_feed_sources\s+AS\s+MATERIALIZED[\s\S]*?ORDER\s+BY\s+head\.sort_at\s+DESC,\s*head\.item_id\s+DESC[\s\S]*?LIMIT\s+\$\d+/i.test(
      query,
    ) &&
    /active_topic_sources\s+AS\s+MATERIALIZED[\s\S]*?ORDER\s+BY\s+head\.sort_at\s+DESC,\s*head\.item_id\s+DESC[\s\S]*?LIMIT\s+\$\d+/i.test(
      query,
    ) &&
    /ranked_direct_sources[\s\S]*?row_number\(\)\s+OVER[\s\S]*?selected_direct_sources[\s\S]*?source_rank\s*<=\s*\$\d+/i.test(
      query,
    )
  const hasFollowLimits =
    /FROM\s+relation__user__follow__rss_feed[\s\S]*?ORDER\s+BY\s+created_at\s+DESC,\s*object_id\s+DESC\s+LIMIT\s+\$\d+/i.test(
      query,
    ) &&
    /FROM\s+relation__user__follow__topic[\s\S]*?ORDER\s+BY\s+created_at\s+DESC,\s*object_id\s+DESC\s+LIMIT\s+\$\d+/i.test(
      query,
    )
  const hasNewestMatchingStoryVeto =
    /FROM\s+rss_feed_item_feed_candidates\s+newer[\s\S]*?WHERE\s+newer\.story_id\s*=\s*candidate\.story_id[\s\S]*?\(newer\.sort_at,\s*newer\.id\)\s*>\s*\(candidate\.published_at,\s*candidate\.item_id\)[\s\S]*?ORDER\s+BY\s+newer\.sort_at\s+DESC,\s*newer\.id\s+DESC\s+LIMIT\s+\$\d+/i.test(
      query,
    ) &&
    /newer_count\s*<=\s*\$\d+[\s\S]*?NOT\s+COALESCE\(newer_probe\.newer_matches,\s*FALSE\)/i.test(
      query,
    ) &&
    !/is_official_for_story/i.test(query)
  const hasShareLimit =
    /FROM\s+rss_feed_item_feed_shares[\s\S]*?ORDER\s+BY\s+sort_at\s+DESC,\s*id\s+DESC\s+LIMIT\s+\$\d+/i.test(
      query,
    )
  const hasTopLevelPageLimit =
    /ORDER\s+BY\s+combined_rss_feed_items\.sort_at\s+DESC,\s*combined_rss_feed_items\.result_id::uuid\s+DESC\s+LIMIT\s+\$\d+\s*$/i.test(
      query.trim(),
    )
  const hasWinnersBeforeCombinedPage =
    query.includes('direct_rss_feed_items AS') &&
    query.indexOf('combined_rss_feed_items AS') > query.indexOf('direct_rss_feed_items AS')
  const continuation = result.scenario_id.includes('-after')
  const hasStrictCursorInEveryWalk =
    !continuation ||
    (hasStrictTuple(query, 'source.item_sort_at', 'source.rss_feed_item_id') &&
      hasStrictTuple(query, 'candidate.sort_at', 'candidate.rss_feed_item_id') &&
      hasStrictTuple(query, 'item_sort_at', 'rss_feed_item_id') &&
      hasStrictTuple(query, 'sort_at', 'rss_feed_item_id') &&
      /\(sort_at,\s*id\)\s*<\s*\(\$\d+::timestamptz,\s*\$\d+::uuid\)/i.test(query) &&
      /\(combined_rss_feed_items\.sort_at,\s*combined_rss_feed_items\.result_id::uuid\)\s*</i.test(
        query,
      ))

  if (
    !hasSourceHeadLimit ||
    !hasTopicHeadLimit ||
    !hasSourceChildLimit ||
    !hasTopicChildLimit ||
    !hasSourceRanking ||
    !hasFollowLimits ||
    !hasNewestMatchingStoryVeto ||
    !hasShareLimit ||
    !hasWinnersBeforeCombinedPage ||
    !hasTopLevelPageLimit ||
    !hasStrictCursorInEveryWalk
  ) {
    throw new Error(
      `${result.name} must rank bounded cursor-relative source heads, read bounded source/topic/share index walks, veto stories only when a newer matching member is proven, and apply the final sort/id page limit`,
    )
  }
}

function hasStrictTuple(query: string, sortColumn: string, idColumn: string): boolean {
  const escapedSort = sortColumn.replaceAll('.', '\\.')
  const escapedId = idColumn.replaceAll('.', '\\.')
  return new RegExp(
    `\\(${escapedSort},\\s*${escapedId}\\)\\s*<\\s*\\(\\$\\d+::timestamptz,\\s*\\$\\d+::uuid\\)`,
    'i',
  ).test(query)
}
