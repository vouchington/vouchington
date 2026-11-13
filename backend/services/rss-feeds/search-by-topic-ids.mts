import { createSearchCache } from '@services/entity-cache/search-cache'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function searchRssFeedIdsByTopicIds(topicIds: string[]): Promise<string[]> {
  if (topicIds.length === 0) return []
  const { rows } = await read(sql`/* searchRssFeedIdsByTopicIds */
    SELECT id
    FROM rss_feeds
    WHERE topic_id = ANY(${topicIds})
      AND deleted_at IS NULL
  `)
  return rows.map(row => row.id as string)
}

export async function searchPrimaryEnabledRssFeedIdsByTopicIds(
  topicIds: string[],
): Promise<string[]> {
  if (topicIds.length === 0) return []
  const { rows } = await read(sql`/* searchPrimaryEnabledRssFeedIdsByTopicIds */
    SELECT rss_feeds.id
    FROM rss_feeds
    JOIN view_rss_feed_current_states current_state
      ON current_state.rss_feed_id = rss_feeds.id
    WHERE rss_feeds.topic_id = ANY(${topicIds})
      AND rss_feeds.deleted_at IS NULL
      AND current_state.is_enabled = TRUE
  `)
  return rows.map(row => row.id as string)
}

export const searchPrimaryEnabledRssFeedIdsByTopicIdsCached = createSearchCache(
  'rss_primary_enabled_feed_ids_anon',
  (topicIds: string[]) => searchPrimaryEnabledRssFeedIdsByTopicIds(topicIds),
)
