import sql, { type SQLStatement } from 'sql-template-strings'

export function appendTopicIdsFilter(searchQuery: SQLStatement, topicIds: string[] | undefined) {
  if (!topicIds || topicIds.length === 0) return
  // Use AND semantics: a community must match ALL requested topic IDs.
  searchQuery.append(sql`
    AND (
      SELECT COUNT(DISTINCT clit.topic_id)
      FROM community_list_items__topics clit
      WHERE clit.community_id = c.id
        AND clit.removed_at IS NULL
        AND clit.topic_id = ANY(${topicIds})
    ) = ${topicIds.length}`)
}
