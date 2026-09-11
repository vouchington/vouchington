import sql, { type SQLStatement } from 'sql-template-strings'
import type { TopicTypes } from '@services/topics'
import { POST_TOPIC_CATEGORY_RELATION_TABLE } from '@services/entity-relations/metadata'
import { searchRecentlyViewed } from '@services/recently-viewed'
import {
  appendRecommendationFilters,
  appendRecommendationSelectAndOrder,
} from './query-filters.mts'

type QueryOptions = {
  score_lt?: number
  id_gt?: string
  name_gt?: string
  limit: number
  topic_types?: TopicTypes[]
  spending_category?: boolean
  rss_feed?: boolean
  sort?: 'score' | 'best'
}

export async function buildRecommendationQuery(
  userId: string,
  options: QueryOptions,
): Promise<SQLStatement> {
  const { score_lt, id_gt, name_gt, limit, topic_types, spending_category, rss_feed, sort } =
    options

  const [viewedPostIds, viewedRssFeedItemIds] = await Promise.all([
    searchRecentlyViewed('post', null, userId, 1000),
    searchRecentlyViewed('rss_feed_item', null, userId, 1000),
  ])

  const query = sql`/* buildRecommendationQuery */
    WITH
    -- Topics from posts you've viewed (weight: 2.0)
    viewed_post_topics AS (
      SELECT DISTINCT
        pr.object_id AS topic_id,
        2.0 AS score,
        'from_viewed_posts' AS reason
      FROM (
        SELECT DISTINCT unnest(${viewedPostIds}::uuid[]) AS post_id
      ) rvp
      INNER JOIN `
    .append(POST_TOPIC_CATEGORY_RELATION_TABLE)
    .append(sql` pr
        ON pr.subject_id = rvp.post_id
        AND pr.deleted_at IS NULL
    ),

    -- Topics from posts you've upvoted (weight: 3.0)
    upvoted_post_topics AS (
      SELECT DISTINCT
        pr.object_id AS topic_id,
        3.0 AS score,
        'from_upvoted_posts' AS reason
      FROM (
        SELECT DISTINCT ON (post_id) post_id, score
        FROM post_votes
        WHERE user_id = ${userId}
        ORDER BY post_id, id DESC
      ) ev
      INNER JOIN posts p
        ON p.id = ev.post_id
        AND p.deleted_at IS NULL
      INNER JOIN `)
    .append(POST_TOPIC_CATEGORY_RELATION_TABLE).append(sql` pr
        ON pr.subject_id = p.id
        AND pr.deleted_at IS NULL
      WHERE ev.score > 0
      LIMIT 1000
    ),

    -- Topics from RSS feeds you follow (weight: 2.5)
    followed_feed_topics AS (
      SELECT DISTINCT
        rf.topic_id,
        2.5 AS score,
        'from_followed_rss_feeds' AS reason
      FROM relation__user__follow__rss_feed ufr
      INNER JOIN rss_feeds rf
        ON rf.id = ufr.object_id
        AND rf.deleted_at IS NULL
      WHERE ufr.subject_id = ${userId}
        AND ufr.deleted_at IS NULL
      LIMIT 1000
    ),

    -- Topics from RSS feed items you've clicked (weight: 2.0)
    clicked_feed_item_topics AS (
      SELECT DISTINCT
        rr.object_id AS topic_id,
        2.0 AS score,
        'from_clicked_rss_feed_items' AS reason
      FROM (
        SELECT DISTINCT unnest(${viewedRssFeedItemIds}::uuid[]) AS rss_feed_item_id
      ) rvi
      INNER JOIN rss_feed_items rfi
        ON rfi.id = rvi.rss_feed_item_id
        AND rfi.deleted_at IS NULL
      INNER JOIN relation__rss_feed_item__category__topic rr
        ON rr.subject_id = rfi.id
        AND rr.deleted_at IS NULL
    ),

    -- Related topics from topics you follow (weight: 1.5)
    related_to_followed_topics AS (
      SELECT DISTINCT
        tr.object_id AS topic_id,
        1.5 AS score,
        'from_followed_topic_relations' AS reason
      FROM relation__user__follow__topic uft
      INNER JOIN relation__topic__related__topic tr
        ON tr.subject_id = uft.object_id
        AND tr.deleted_at IS NULL
      WHERE uft.subject_id = ${userId}
        AND uft.deleted_at IS NULL
      LIMIT 1000
    ),

    -- Combine all sources and aggregate scores
    all_recommendations AS (
      SELECT topic_id, score, reason FROM viewed_post_topics
      UNION ALL
      SELECT topic_id, score, reason FROM upvoted_post_topics
      UNION ALL
      SELECT topic_id, score, reason FROM followed_feed_topics
      UNION ALL
      SELECT topic_id, score, reason FROM clicked_feed_item_topics
      UNION ALL
      SELECT topic_id, score, reason FROM related_to_followed_topics
    ),

    aggregated_recommendations AS (
      SELECT
        topic_id,
        SUM(score) AS total_score,
        string_agg(DISTINCT reason, ', ' ORDER BY reason) AS reasons
      FROM all_recommendations
      GROUP BY topic_id
    ),

    -- Exclude topics that should be filtered out
    filtered_recommendations AS (
      SELECT
        ar.topic_id,
        ar.total_score,
        ar.reasons,
        t.name
      FROM aggregated_recommendations ar
      INNER JOIN topics t
        ON t.id = ar.topic_id
        AND t.deleted_at IS NULL
        AND t.merged_into_topic_id IS NULL`)

  query.append(sql`
      -- Exclude already followed topics
      LEFT JOIN relation__user__follow__topic followed
        ON followed.subject_id = ${userId}
        AND followed.object_id = ar.topic_id
        AND followed.deleted_at IS NULL
      -- Exclude muted topics
      LEFT JOIN relation__user__mute__topic muted
        ON muted.subject_id = ${userId}
        AND muted.object_id = ar.topic_id
        AND muted.deleted_at IS NULL
      -- Exclude dismissed recommendations
      LEFT JOIN relation__user__dismiss_recommendation__topic dismissed
        ON dismissed.subject_id = ${userId}
        AND dismissed.object_id = ar.topic_id
        AND dismissed.deleted_at IS NULL
      WHERE followed.subject_id IS NULL
        AND muted.subject_id IS NULL
        AND dismissed.subject_id IS NULL`)

  appendRecommendationFilters(query, {
    id_gt,
    name_gt,
    rss_feed,
    score_lt,
    sort,
    spending_category,
    topic_types,
  })
  appendRecommendationSelectAndOrder(query, limit, sort)

  return query
}
