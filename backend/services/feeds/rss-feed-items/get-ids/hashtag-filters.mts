import sql, { type SQLStatement } from 'sql-template-strings'
import { buildItemSourceTopicMatch, buildItemTopicMatch } from './item-membership.mts'

export function appendRssFeedItemHashtagFilters(
  query: SQLStatement,
  {
    aliasIds,
    hasUnknownHashtag,
    rssFeedItemId = sql`rss_feed_items.id`,
    topicIds,
  }: {
    aliasIds: string[] | undefined
    hasUnknownHashtag: boolean | undefined
    rssFeedItemId?: SQLStatement
    topicIds: string[] | undefined
  },
): void {
  if (hasUnknownHashtag) query.append(sql` AND FALSE`)
  for (const topicId of [...new Set(topicIds ?? [])]) {
    const topicIdArray = sql`ARRAY[${topicId}::uuid]`
    query
      .append(sql` AND (`)
      .append(buildItemSourceTopicMatch(rssFeedItemId, topicIdArray))
      .append(sql` OR `)
      .append(buildItemTopicMatch(rssFeedItemId, topicIdArray, false))
      .append(sql`)`)
  }
  for (const aliasId of [...new Set(aliasIds ?? [])]) {
    query
      .append(sql` AND COALESCE((SELECT TRUE
      FROM relation__rss_feed_item__category__topic_alias relation
      WHERE relation.subject_id = `)
      .append(rssFeedItemId).append(sql` AND relation.object_id = ${aliasId}::uuid
        AND relation.deleted_at IS NULL
        AND relation.votes_score_net > 0), FALSE)`)
  }
}
