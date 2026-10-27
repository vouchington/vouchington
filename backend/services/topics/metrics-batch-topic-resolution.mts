export function topicResolutionCtes(): string {
  return `
    id_lookups AS (
      SELECT COALESCE(topic.merged_into_topic_id, topic.id) AS id, input_data.input_order
      FROM input_data
      JOIN LATERAL (
        SELECT topic_row.id, topic_row.merged_into_topic_id, topic_row.deleted_at
        FROM topics topic_row
        WHERE topic_row.id = input_data.input_value
        ORDER BY topic_row.id
        LIMIT 1
      ) topic ON TRUE
      LEFT JOIN LATERAL (
        SELECT destination_row.deleted_at, destination_row.merged_into_topic_id
        FROM topics destination_row
        WHERE destination_row.id = topic.merged_into_topic_id
        ORDER BY destination_row.id
        LIMIT 1
      ) destination ON topic.merged_into_topic_id IS NOT NULL
      WHERE topic.deleted_at IS NULL
        AND (
          topic.merged_into_topic_id IS NULL
          OR (destination.deleted_at IS NULL AND destination.merged_into_topic_id IS NULL)
        )
    ),
    slug_matches AS (
      SELECT
        slug_input_data.input_order,
        COALESCE(topic.merged_into_topic_id, topic.id) AS id,
        topic.id AS topic_row_id,
        CASE WHEN topic.merged_into_topic_id IS NULL THEN 0 ELSE 1 END AS rank
      FROM slug_input_data
      JOIN LATERAL (
        SELECT topic_row.id, topic_row.merged_into_topic_id, topic_row.deleted_at
        FROM topics topic_row
        WHERE topic_row.slug = slug_input_data.input_value
        ORDER BY topic_row.slug
        LIMIT 1
      ) topic ON TRUE
      LEFT JOIN LATERAL (
        SELECT destination_row.deleted_at, destination_row.merged_into_topic_id
        FROM topics destination_row
        WHERE destination_row.id = topic.merged_into_topic_id
        ORDER BY destination_row.id
        LIMIT 1
      ) destination ON topic.merged_into_topic_id IS NOT NULL
      WHERE topic.deleted_at IS NULL
        AND (
          topic.merged_into_topic_id IS NULL
          OR (destination.deleted_at IS NULL AND destination.merged_into_topic_id IS NULL)
        )
      UNION ALL
      SELECT
        slug_input_data.input_order,
        COALESCE(topic.merged_into_topic_id, topic.id) AS id,
        topic.id AS topic_row_id,
        2 AS rank
      FROM slug_input_data
      JOIN LATERAL (
        SELECT alias_row.topic_id
        FROM topic_aliases alias_row
        WHERE alias_row.alias = slug_input_data.input_value
        ORDER BY alias_row.alias
        LIMIT 1
      ) alias ON TRUE
      JOIN LATERAL (
        SELECT topic_row.id, topic_row.merged_into_topic_id, topic_row.deleted_at
        FROM topics topic_row
        WHERE topic_row.id = alias.topic_id
        ORDER BY topic_row.id
        LIMIT 1
      ) topic ON TRUE
      LEFT JOIN LATERAL (
        SELECT destination_row.deleted_at, destination_row.merged_into_topic_id
        FROM topics destination_row
        WHERE destination_row.id = topic.merged_into_topic_id
        ORDER BY destination_row.id
        LIMIT 1
      ) destination ON topic.merged_into_topic_id IS NOT NULL
      WHERE topic.deleted_at IS NULL
        AND (
          topic.merged_into_topic_id IS NULL
          OR (destination.deleted_at IS NULL AND destination.merged_into_topic_id IS NULL)
        )
    ),
    slug_lookups AS (
      SELECT DISTINCT ON (match.input_order) match.id, match.input_order
      FROM slug_matches match
      ORDER BY match.input_order, match.rank, match.topic_row_id
    ),
    combined_ids AS (
      SELECT id, input_order FROM id_lookups
      UNION
      SELECT id, input_order FROM slug_lookups
    ),
    requested_topic_ids AS (
      SELECT DISTINCT id FROM combined_ids
    ),`
}
