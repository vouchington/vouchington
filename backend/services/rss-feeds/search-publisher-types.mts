import sql from 'sql-template-strings'

/** Find feed topics whose dominant active publisher type is one of the requested topics. */
export function publisherTypeCandidateJoin(publisherTypeIds: readonly string[]) {
  return sql` JOIN (
    SELECT DISTINCT requested.subject_id
    FROM relation__topic__publisher_type__topic requested
    JOIN topics requested_type ON requested_type.id = requested.object_id
      AND requested_type.deleted_at IS NULL
    JOIN LATERAL (
      SELECT relation.object_id
      FROM relation__topic__publisher_type__topic relation
      JOIN topics publisher_type ON publisher_type.id = relation.object_id
      WHERE relation.subject_id = requested.subject_id
        AND relation.deleted_at IS NULL
        AND relation.votes_score_net > 0
        AND publisher_type.deleted_at IS NULL
      ORDER BY relation.votes_score_net DESC NULLS LAST, relation.id ASC
      LIMIT 1
    ) dominant ON dominant.object_id = requested.object_id
    WHERE requested.object_id = ANY(${publisherTypeIds})
      AND requested.deleted_at IS NULL
      AND requested.votes_score_net > 0
  ) selected_publisher_types ON selected_publisher_types.subject_id = rss_feeds.topic_id`
}

/** Exclude feeds whose dominant active publisher type is muted by this user. */
export function mutedPublisherTypeFilter(userId: string) {
  return sql`rss_feeds.topic_id <> ALL(ARRAY(
    SELECT DISTINCT requested.subject_id
    FROM relation__user__mute__topic mute
    JOIN relation__topic__publisher_type__topic requested
      ON requested.object_id = mute.object_id
    JOIN topics requested_type ON requested_type.id = requested.object_id
      AND requested_type.deleted_at IS NULL
    JOIN LATERAL (
      SELECT relation.object_id
      FROM relation__topic__publisher_type__topic relation
      JOIN topics publisher_type ON publisher_type.id = relation.object_id
      WHERE relation.subject_id = requested.subject_id
        AND relation.deleted_at IS NULL
        AND relation.votes_score_net > 0
        AND publisher_type.deleted_at IS NULL
      ORDER BY relation.votes_score_net DESC NULLS LAST, relation.id ASC
      LIMIT 1
    ) dominant ON dominant.object_id = requested.object_id
    WHERE mute.subject_id = ${userId}
      AND mute.deleted_at IS NULL
      AND requested.deleted_at IS NULL
      AND requested.votes_score_net > 0
  ))`
}
