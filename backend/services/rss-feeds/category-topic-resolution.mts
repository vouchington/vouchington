import { write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type FeedCategoryTopic = {
  category_identity_id: string
  topic_id: string | null
  previous_topic_id: string | null
}

export async function resolveRssFeedCategoryTopics(
  rssFeedId: string,
  categories: string[],
  query?: TransactionQuery,
): Promise<FeedCategoryTopic[]> {
  const { rows } = await write<FeedCategoryTopic>(
    sql`/* resolveRssFeedCategoryTopics */
      SELECT identity.id AS category_identity_id,
        COALESCE(t_alias.id, t_name.id, t_slug.id) AS topic_id,
        existing.topic_id AS previous_topic_id
      FROM UNNEST(${categories}::text[]) AS input(category_text)
      JOIN rss_category_identities identity ON identity.category_text = input.category_text
      LEFT JOIN rss_feed_categories existing
        ON existing.rss_feed_id = ${rssFeedId} AND existing.category_identity_id = identity.id
      LEFT JOIN topic_aliases ta ON ta.alias = input.category_text
      LEFT JOIN topics t_alias ON t_alias.id = ta.topic_id AND t_alias.deleted_at IS NULL
      LEFT JOIN topics t_name ON LOWER(t_name.name) = input.category_text
        AND t_name.deleted_at IS NULL AND t_name.merged_into_topic_id IS NULL
      LEFT JOIN topics t_slug ON t_slug.slug = input.category_text
        AND t_slug.deleted_at IS NULL AND t_slug.merged_into_topic_id IS NULL
      ORDER BY identity.id`,
    undefined,
    query ? { query } : {},
  )
  return rows
}
