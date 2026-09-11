import { write } from '@data-stores/psql'
import { RSS_FEED_CATEGORIZER_USERNAME } from '@services/users/constants'
import sql from 'sql-template-strings'

export async function readCategoryDataChunk(
  categories: Array<{
    rss_feed_item_id: string
    category: string
    hashtag_alias: string | null
  }>,
) {
  const rssFeedItemIds = categories.map(c => c.rss_feed_item_id)
  const categoryTexts = categories.map(c => c.category)
  const hashtagAliases = categories.map(c => c.hashtag_alias)

  // This is a writer read: aliases may have been created immediately before this query.
  const { rows } = await write(sql`/* upsertRssFeedItemCategories */
      SELECT
        input.rss_feed_item_id,
        input.category_text,
        existing.category_text IS NOT NULL as exists,
        existing.topic_id as existing_topic_id,
        existing.topic_alias_id as existing_topic_alias_id,
        COALESCE(t_alias.id, t_name.id, t_slug.id) as new_topic_id
        , ta.id as new_topic_alias_id
        , COALESCE(topic_vote.confirmed, FALSE) as topic_relation_confirmed
        , COALESCE(hashtag_vote.confirmed, FALSE) as hashtag_relation_confirmed
      FROM (
        SELECT
          unnest(${rssFeedItemIds}::uuid[]) as rss_feed_item_id,
          unnest(${categoryTexts}::text[]) as category_text,
          unnest(${hashtagAliases}::text[]) as hashtag_alias
      ) as input
      LEFT JOIN rss_feed_item_categories existing
        ON existing.rss_feed_item_id = input.rss_feed_item_id
        AND LOWER(existing.category_text) = LOWER(input.category_text)
      LEFT JOIN topic_aliases ta
        ON ta.alias = input.hashtag_alias
      LEFT JOIN topic_aliases text_alias
        ON text_alias.alias = LOWER(input.category_text)
      LEFT JOIN topics t_alias ON t_alias.id = COALESCE(ta.topic_id, text_alias.topic_id) AND t_alias.deleted_at IS NULL AND t_alias.merged_into_topic_id IS NULL
      LEFT JOIN topics t_name ON LOWER(t_name.name) = LOWER(input.category_text) AND t_name.deleted_at IS NULL AND t_name.merged_into_topic_id IS NULL
      LEFT JOIN topics t_slug ON t_slug.slug = LOWER(input.category_text) AND t_slug.deleted_at IS NULL AND t_slug.merged_into_topic_id IS NULL
      LEFT JOIN relation__rss_feed_item__category__topic topic_relation
        ON topic_relation.subject_id = input.rss_feed_item_id
        AND topic_relation.object_id = COALESCE(existing.topic_id, t_alias.id, t_name.id, t_slug.id)
        AND topic_relation.deleted_at IS NULL
      LEFT JOIN relation__rss_feed_item__category__topic_alias hashtag_relation
        ON hashtag_relation.subject_id = input.rss_feed_item_id
        AND hashtag_relation.object_id = COALESCE(existing.topic_alias_id, ta.id)
        AND hashtag_relation.deleted_at IS NULL
      LEFT JOIN users categorizer
        ON categorizer.username = ${RSS_FEED_CATEGORIZER_USERNAME}
        AND categorizer.is_system IS TRUE
      LEFT JOIN LATERAL (
        SELECT vote.score > 0 AND (
          topic_relation.votes_score_up <> 0 OR
          topic_relation.votes_score_none <> 0 OR
          topic_relation.votes_score_down <> 0
        ) AS confirmed
        FROM relation__rss_feed_item__category__topic__votes vote
        WHERE vote.entity_relation_id = topic_relation.id
          AND vote.user_id = categorizer.id
        ORDER BY vote.id DESC
        LIMIT 1
      ) topic_vote ON TRUE
      LEFT JOIN LATERAL (
        SELECT vote.score > 0 AND (
          hashtag_relation.votes_score_up <> 0 OR
          hashtag_relation.votes_score_none <> 0 OR
          hashtag_relation.votes_score_down <> 0
        ) AS confirmed
        FROM relation__rss_feed_item__category__topic_alias__votes vote
        WHERE vote.entity_relation_id = hashtag_relation.id
          AND vote.user_id = categorizer.id
        ORDER BY vote.id DESC
        LIMIT 1
      ) hashtag_vote ON TRUE
    `)
  return rows
}
