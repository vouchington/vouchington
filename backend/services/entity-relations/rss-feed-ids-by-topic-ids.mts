import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

// Reimplementation of @services/rss-feeds' searchRssFeedIdsByTopicIds — a simple,
// side-effect-free lookup. Reimplemented here (rather than imported) so entity-relations never
// depends on @services/rss-feeds, which already depends on entity-relations for relation writes.
// Also consumed by @services/elections-votes (topic/entity-relation vote-stats), which already
// depends on entity-relations, to avoid an elections-votes<->rss-feeds cycle.
export async function findRssFeedIdsByTopicIds(topicIds: string[]): Promise<string[]> {
  if (topicIds.length === 0) return []
  const { rows } = await read(sql`/* findRssFeedIdsByTopicIds */
    SELECT id
    FROM rss_feeds
    WHERE topic_id = ANY(${topicIds})
      AND deleted_at IS NULL
  `)
  return rows.map(row => row.id as string)
}
