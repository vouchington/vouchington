import sql, { type SQLStatement } from 'sql-template-strings'
import type { RssFeedItemFeedType } from '../../types.mts'
import { buildStableStoryMatch } from './story-follow-match.mts'

type StoryWinnerOptions = {
  communityId?: string
  currentUserId?: string
  feedType: RssFeedItemFeedType | undefined
  storyItemLimit: number
  eligibilityChildLimit: number
  minScoreFollowRssFeeds: number
  minScoreFollowTopics: number
}

/** A story is represented only by its newest provably matching member. */
export function appendDirectWinnerCTE(query: SQLStatement, options: StoryWinnerOptions): void {
  query.append(sql`
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
      FROM direct_candidate_rss_feed_items candidate
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS newer_count,
          bool_or(eligible.item_id IS NOT NULL AND `)
  query.append(
    buildStableStoryMatch(sql`eligible.item_id`, sql`eligible.votes_score_net`, {
      ...options,
      allowUnknown: true,
    }),
  )
  query.append(sql`) AS newer_matches
        FROM (
          SELECT newer.id FROM rss_feed_item_feed_candidates newer
          WHERE newer.story_id = candidate.story_id AND newer.deleted_at IS NULL
            AND (newer.sort_at, newer.id) > (candidate.published_at, candidate.item_id)
          ORDER BY newer.sort_at DESC, newer.id DESC
          LIMIT ${options.storyItemLimit + 1}
        ) newer
        LEFT JOIN LATERAL (
          SELECT * FROM eligible_rss_feed_items
          WHERE item_id = newer.id LIMIT 1
        ) eligible ON TRUE
      ) newer_probe ON candidate.story_id IS NOT NULL
      WHERE candidate.story_id IS NULL OR (
        newer_probe.newer_count <= ${options.storyItemLimit}
        AND NOT COALESCE(newer_probe.newer_matches, FALSE)
      )
  `)
}
