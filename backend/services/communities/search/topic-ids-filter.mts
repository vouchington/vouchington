import sql, { type SQLStatement } from 'sql-template-strings'

export function appendTopicIdsFilter(searchQuery: SQLStatement, topicIds: string[] | undefined) {
  if (!topicIds || topicIds.length === 0) return
  // Use AND semantics: a community must match ALL requested topic IDs.
  for (const topicId of new Set(topicIds)) {
    searchQuery.append(sql`
      AND EXISTS (
        SELECT 1 FROM community_list_topics clit
        WHERE clit.community_id = c.id
          AND clit.topic_id = ${topicId}
          AND clit.removed_at IS NULL
      )`)
  }
}
