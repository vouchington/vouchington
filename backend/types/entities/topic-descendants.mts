import sql from 'sql-template-strings'

// Relocated from backend/services/topics/descendants-sql.mts (pure SQL-fragment builder, no
// service dependencies) so that backend/services/urls-hostnames can build topic-descendant CTEs
// without creating a urls-hostnames -> topics workspace cycle. Split into its own file (rather
// than living in topic.mts alongside createTopicEmbeddingContent) to stay under the 200-line
// oxlint max-lines cap.
export function appendTopicDescendantsCte(
  query: ReturnType<typeof sql>,
  topicIds: string[],
  options: { trailingComma?: boolean; shareRootInputs?: boolean } = {},
): void {
  if (options.shareRootInputs) {
    query.append(sql`topic_descendant_roots AS NOT MATERIALIZED (
      SELECT root_post_id FROM unnest(ARRAY[`)
    topicIds.forEach((id, index) => {
      if (index > 0) query.append(sql`, `)
      query.append(sql`${id}::uuid`)
    })
    query.append(sql`]::uuid[]) AS input(root_post_id)
    ), `)
  }
  query.append(sql`topic_descendants AS (
    SELECT topics.id AS root_post_id, topics.id AS topic_id
    FROM topics
    JOIN `)
  query.append(
    options.shareRootInputs
      ? sql`topic_descendant_roots roots`
      : sql`unnest(${topicIds}::uuid[]) AS roots(root_post_id)`,
  )
  query.append(sql` ON roots.root_post_id = topics.id
    WHERE topics.deleted_at IS NULL
      AND topics.merged_into_topic_id IS NULL
    UNION
    SELECT
      topic_descendants.root_post_id,
      child_edge.subject_id AS topic_id
    FROM topic_descendants
    JOIN relation__topic__parent__topic child_edge
      ON child_edge.object_id = topic_descendants.topic_id
     AND child_edge.deleted_at IS NULL
    JOIN topics
      ON topics.id = child_edge.subject_id
    WHERE topics.deleted_at IS NULL
  )`)

  if (options.trailingComma !== false) {
    query.append(sql`, `)
  }
}
