import sql, { type SQLStatement } from 'sql-template-strings'

type TopicPredicate = (topicId: SQLStatement) => SQLStatement

/** Probe an item's own topic rows with one predicate on each topic id. */
export function buildItemTopicPredicateMatch(
  itemId: SQLStatement,
  matchesTopic: TopicPredicate,
  includeRawCategories: boolean,
): SQLStatement {
  const query = sql`(`
  if (includeRawCategories) {
    query
      .append(sql`COALESCE((SELECT BOOL_OR(`)
      .append(matchesTopic(sql`category.topic_id`))
      .append(sql`) FROM rss_feed_item_categories category
        WHERE category.rss_feed_item_id = `)
      .append(itemId)
      .append(sql`), FALSE) OR `)
  }
  query
    .append(sql`COALESCE((SELECT BOOL_OR(`)
    .append(matchesTopic(sql`relation.object_id`))
    .append(sql`) FROM relation__rss_feed_item__category__topic relation
      WHERE relation.subject_id = `)
    .append(itemId)
    .append(sql` AND relation.deleted_at IS NULL AND relation.votes_score_net > 0), FALSE)
    OR COALESCE((SELECT BOOL_OR(`)
    .append(matchesTopic(sql`alias.topic_id`))
    .append(sql`) FROM relation__rss_feed_item__category__topic_alias relation
      JOIN topic_aliases alias ON alias.id = relation.object_id
      WHERE relation.subject_id = `)
    .append(itemId)
    .append(sql` AND relation.deleted_at IS NULL AND relation.votes_score_net > 0), FALSE))`)
  return query
}

/** Fixed topic-id filters use the same item-child probes without raw categories. */
export function buildItemTopicMatch(
  itemId: SQLStatement,
  topicIds: SQLStatement,
  includeRawCategories: boolean,
): SQLStatement {
  return buildItemTopicPredicateMatch(
    itemId,
    topicId =>
      sql``
        .append(topicId)
        .append(sql` = ANY((`)
        .append(topicIds)
        .append(sql`)::uuid[])`),
    includeRawCategories,
  )
}

/** Check only the source rows belonging to this item against active feed topics. */
export function buildItemSourceTopicMatch(
  itemId: SQLStatement,
  topicIds: SQLStatement,
): SQLStatement {
  return sql`COALESCE((SELECT BOOL_OR(COALESCE((
    SELECT feed.topic_id = ANY((`
    .append(topicIds)
    .append(sql`)::uuid[]) FROM rss_feeds feed
    WHERE feed.id = source.rss_feed_id
      AND feed.is_enabled = TRUE AND feed.deleted_at IS NULL
  ), FALSE)) FROM rss_feed_item_sources source
  WHERE source.rss_feed_item_id = `)
    .append(itemId)
    .append(sql`), FALSE)`)
}
