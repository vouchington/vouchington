import sql, { type SQLStatement } from 'sql-template-strings'

export function appendDirectWinnerCTE(
  query: SQLStatement,
  {
    storyItemLimit,
    eligibilityChildLimit,
  }: { storyItemLimit: number; eligibilityChildLimit: number },
): void {
  query.append(sql`
    ), direct_story_seeds AS MATERIALIZED (
      SELECT DISTINCT story_id
      FROM direct_candidate_rss_feed_items
      WHERE story_id IS NOT NULL
    ), direct_story_eligible_members AS MATERIALIZED (
      SELECT child.*
      FROM direct_story_seeds seed
      CROSS JOIN LATERAL (
        SELECT matched.*,
          ranked.is_official_for_story,
          ranked.votes_score_sort
        FROM (
          SELECT candidate.id, candidate.is_official_for_story, candidate.votes_score_sort
          FROM rss_feed_item_feed_candidates candidate
          WHERE candidate.story_id = seed.story_id
            AND candidate.deleted_at IS NULL
            AND candidate.votes_score_net > 0
          ORDER BY candidate.is_official_for_story DESC,
            candidate.votes_score_sort DESC, candidate.id DESC
          LIMIT ${storyItemLimit}
        ) ranked
        JOIN direct_candidate_rss_feed_items matched ON matched.item_id = ranked.id
        ORDER BY ranked.is_official_for_story DESC,
          ranked.votes_score_sort DESC, ranked.id DESC
        LIMIT ${eligibilityChildLimit}
      ) child
    ), direct_story_winners AS MATERIALIZED (
      SELECT DISTINCT ON (candidate.story_id)
        candidate.item_id, candidate.votes_score_net, candidate.published_at,
        candidate.story_id, candidate.matches_source, candidate.matches_topics
      FROM direct_story_eligible_members candidate
      ORDER BY candidate.story_id, candidate.is_official_for_story DESC,
        candidate.votes_score_sort DESC, candidate.item_id DESC
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
        candidate.matches_source,
        candidate.matches_topics
      FROM (
        SELECT * FROM direct_candidate_rss_feed_items WHERE story_id IS NULL
        UNION ALL
        SELECT * FROM direct_story_winners
      ) candidate
  `)
}
