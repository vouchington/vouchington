/** Resolve a retained source-topic FK through its active merge destination in one read. */
export const TOPIC_CLAIM_LABEL_JOINS = `
  LEFT JOIN topics claim_source_topic ON claim_source_topic.id = tc.topic_id
    AND claim_source_topic.deleted_at IS NULL
  LEFT JOIN view_topics claim_label_topic
    ON claim_label_topic.id = COALESCE(claim_source_topic.merged_into_topic_id, claim_source_topic.id)
`

export const TOPIC_CLAIM_LABEL_SQL =
  "COALESCE(claim_label_topic.name, claim_label_topic.slug, 'topic')"
