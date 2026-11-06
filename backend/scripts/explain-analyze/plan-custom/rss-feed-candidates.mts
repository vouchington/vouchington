import type { ExplainResult } from '@data-stores/psql'

export function assertRssFeedCandidatesAreSetBased(result: ExplainResult): void {
  if (!result.scenario_id?.startsWith('rss-feed-item-feed')) return
  const query = result.query_text
  const hasSourceItemLimit =
    /FROM\s+rss_feed_item_sources\s+(?:AS\s+)?source[\s\S]*?ORDER\s+BY\s+source\.item_sort_at\s+DESC,[\s\S]*?LIMIT\s+\$\d+/i.test(
      query,
    )
  const hasTopicItemLimit =
    /FROM\s+rss_feed_item_topic_candidates\s+(?:AS\s+)?candidate[\s\S]*?ORDER\s+BY\s+candidate\.sort_at\s+DESC,[\s\S]*?LIMIT\s+\$\d+/i.test(
      query,
    )
  const hasFollowLimits =
    /FROM\s+relation__user__follow__rss_feed[\s\S]*?ORDER\s+BY\s+created_at\s+DESC,\s*object_id\s+DESC\s+LIMIT\s+\$\d+/i.test(
      query,
    ) &&
    /FROM\s+relation__user__follow__topic[\s\S]*?ORDER\s+BY\s+created_at\s+DESC,\s*object_id\s+DESC\s+LIMIT\s+\$\d+/i.test(
      query,
    )
  const hasBoundedStoryWinners =
    /SELECT\s+DISTINCT\s+ON\s*\(\s*candidate\.story_id\s*\)/i.test(query) &&
    /FROM\s+rss_feed_item_feed_candidates\s+(?:AS\s+)?candidate[\s\S]*?ORDER\s+BY\s+candidate\.is_official_for_story\s+DESC,[\s\S]*?LIMIT\s+\$\d+/i.test(
      query,
    )
  const hasTopLevelPageLimit =
    /ORDER\s+BY\s+[\w.]+\.sort_at\s+DESC,\s*[\w.]+\.result_id::uuid\s+DESC\s+LIMIT\s+\$\d+\s*$/i.test(
      query.trim(),
    )
  const winnerPosition = query.indexOf('direct_story_winners AS MATERIALIZED')
  const combinedPosition = query.indexOf('combined_rss_feed_items AS')
  const hasWinnerBeforeCursor = winnerPosition >= 0 && combinedPosition > winnerPosition
  const hasTupleCursor =
    !result.scenario_id.includes('-after') ||
    /\(combined_rss_feed_items\.sort_at,\s*combined_rss_feed_items\.result_id::uuid\)\s*</i.test(
      query,
    )
  if (
    !hasSourceItemLimit ||
    !hasTopicItemLimit ||
    !hasFollowLimits ||
    !hasBoundedStoryWinners ||
    !hasWinnerBeforeCursor ||
    !hasTopLevelPageLimit ||
    !hasTupleCursor
  ) {
    throw new Error(
      `${result.name} must bound both source child streams and follow inputs, select bounded semantic story winners before the final page limit, and continue by the stateless sort/id tuple`,
    )
  }
}
