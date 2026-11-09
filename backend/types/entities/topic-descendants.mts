import sql from 'sql-template-strings'

// Relocated from backend/services/topics/descendants-sql.mts (pure SQL-fragment builder, no
// service dependencies) so that backend/services/urls-hostnames can build topic-descendant CTEs
// without creating a urls-hostnames -> topics workspace cycle. Split into its own file (rather
// than living in topic.mts alongside createTopicEmbeddingContent) to stay under the 200-line
// oxlint max-lines cap.
export function appendTopicDescendantsCte(
  query: ReturnType<typeof sql>,
  topicIds: string[],
  options: { trailingComma?: boolean; bindRootIdsIndividually?: boolean } = {},
): void {
  query.append(sql`topic_descendants AS (
    SELECT topics.id AS root_post_id, topics.id AS topic_id
    FROM topics
    JOIN unnest(`)
  if (options.bindRootIdsIndividually) {
    query.append(sql`ARRAY[`)
    topicIds.forEach((id, index) => {
      if (index > 0) query.append(sql`, `)
      query.append(sql`${id}::uuid`)
    })
    query.append(sql`]::uuid[]`)
  } else {
    query.append(sql`${topicIds}::uuid[]`)
  }
  query.append(sql`) AS roots(root_post_id)
      ON roots.root_post_id = topics.id
    WHERE topics.deleted_at IS NULL
      AND topics.merged_into_topic_id IS NULL
    UNION
    SELECT
      topic_descendants.root_post_id,
      relation__topic__parent__topic.subject_id AS topic_id
    FROM topic_descendants
    JOIN relation__topic__parent__topic
      ON relation__topic__parent__topic.object_id = topic_descendants.topic_id
    JOIN topics
      ON topics.id = relation__topic__parent__topic.subject_id
    WHERE relation__topic__parent__topic.deleted_at IS NULL
      AND topics.deleted_at IS NULL
  )`)

  if (options.trailingComma !== false) {
    query.append(sql`, `)
  }
}
