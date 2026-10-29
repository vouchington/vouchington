/** Resolve a retained source-topic reference to its active merge destination. */
const DESTINATION_JOIN = `
  LEFT JOIN view_topics topic_label_destination
    ON topic_label_destination.id = COALESCE(topic_label_source.merged_into_topic_id, topic_label_source.id)
`

export const CANONICAL_TOPIC_LABEL_SQL =
  "COALESCE(topic_label_destination.name, topic_label_destination.slug, 'topic')"

export function canonicalTopicLabelJoins(source: 'claim' | 'flag'): string {
  switch (source) {
    case 'claim':
      return `LEFT JOIN topics topic_label_source ON topic_label_source.id = tc.topic_id
        AND topic_label_source.deleted_at IS NULL${DESTINATION_JOIN}`
    case 'flag':
      return `LEFT JOIN topics topic_label_source ON topic_label_source.id = f.topic_id
        AND topic_label_source.deleted_at IS NULL${DESTINATION_JOIN}`
    default:
      throw new Error(`Unsupported canonical topic label source: ${source}`)
  }
}
