import sql from 'sql-template-strings'

/** Match a feed's dominant active publisher type without multiplying feed rows. */
export function publisherTypeFilter(publisherTypeIds: readonly string[]) {
  if (publisherTypeIds.length === 0) return sql`FALSE`
  const query = sql`EXISTS (
    SELECT 1
    FROM relation__topic__publisher_type__topic requested
    WHERE requested.subject_id = rss_feeds.topic_id
      AND requested.object_id IN (`
  publisherTypeIds.forEach((id, index) => {
    if (index > 0) query.append(sql`, `)
    query.append(sql`${id}::uuid`)
  })
  return query
    .append(sql`)
      AND requested.deleted_at IS NULL
      AND requested.votes_score_net > 0
      AND requested.object_id = `)
    .append(dominantPublisherTypeId())
    .append(sql`)`)
}

/** Exclude feeds whose dominant active publisher type is muted by this user. */
export function mutedPublisherTypeFilter(userId: string) {
  return sql`NOT EXISTS (
    SELECT 1
    FROM relation__user__mute__topic mute
    JOIN relation__topic__publisher_type__topic requested
      ON requested.subject_id = rss_feeds.topic_id AND requested.object_id = mute.object_id
    WHERE mute.subject_id = ${userId}
      AND mute.deleted_at IS NULL
      AND requested.deleted_at IS NULL
      AND requested.votes_score_net > 0
      AND requested.object_id = `
    .append(dominantPublisherTypeId())
    .append(sql`)`)
}

function dominantPublisherTypeId() {
  return sql`(
    SELECT relation.object_id
    FROM relation__topic__publisher_type__topic relation
    JOIN topics publisher_type ON publisher_type.id = relation.object_id
    WHERE relation.subject_id = requested.subject_id
      AND relation.deleted_at IS NULL
      AND relation.votes_score_net > 0
      AND publisher_type.deleted_at IS NULL
      AND publisher_type.merged_into_topic_id IS NULL
    ORDER BY relation.votes_score_sort DESC, relation.created_at DESC, relation.object_id DESC
    LIMIT 1
  )`
}
