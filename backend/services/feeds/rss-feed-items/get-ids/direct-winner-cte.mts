import sql, { type SQLStatement } from 'sql-template-strings'

export function appendDirectWinnerCTE(query: SQLStatement): void {
  query.append(sql`
    ), direct_story_winners AS MATERIALIZED (
      SELECT DISTINCT ON (candidate.story_id) candidate.*
      FROM direct_candidate_rss_feed_items candidate
      LEFT JOIN stories ON stories.id = candidate.story_id AND stories.deleted_at IS NULL
      WHERE candidate.story_id IS NOT NULL
      ORDER BY candidate.story_id,
        CASE WHEN stories.official_rss_feed_item_id = candidate.item_id THEN 1 ELSE 0 END DESC,
        COALESCE(candidate.votes_score_net, 0) DESC,
        candidate.item_id DESC
    ), direct_rss_feed_items AS (
      SELECT
        candidate.item_id,
        candidate.item_id::text AS result_id,
        candidate.item_id::text AS entity_id,
        candidate.votes_score_net,
        candidate.published_at,
        candidate.published_at AS sort_at,
        candidate.story_id,
        'direct'::text AS delivery_type,
        NULL::uuid AS shared_by_id,
        NULL::timestamptz AS shared_at,
        0::int AS sort_rank,
        NULL::uuid AS share_event_id,
        candidate.matches_source,
        candidate.matches_topics
      FROM (
        SELECT * FROM direct_candidate_rss_feed_items WHERE story_id IS NULL
        UNION ALL
        SELECT * FROM direct_story_winners
      ) candidate
  `)
}
