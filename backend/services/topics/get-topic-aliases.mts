import { read } from '@data-stores/psql'

export const getTopicAliasRecords = async (
  topicId: string,
  options: { limit?: number; after?: string } = {},
): Promise<{
  results: Array<{ id: string; alias: string; topic_id: string }>
  hasNextPage: boolean
}> => {
  const limit = Math.max(1, Math.min(100, options.limit ?? 25))
  const values: (string | number)[] = []
  const filters = [`topic_id = $${values.push(topicId)}`]
  if (options.after) {
    filters.push(`alias > $${values.push(options.after)}`)
  }

  const query = `/* getTopicAliases */
    SELECT id, alias, topic_id
    FROM topic_aliases
    WHERE ${filters.join(' AND ')}
    ORDER BY alias
    LIMIT $${values.push(limit + 1)}
  `

  const { rows } = await read<{ id: string; alias: string; topic_id: string }>(query, values)
  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit)
  return { results, hasNextPage }
}

export const getTopicAliases = async (
  topicId: string,
  options: { limit?: number; after?: string } = {},
): Promise<{ results: string[]; hasNextPage: boolean }> => {
  const { results, hasNextPage } = await getTopicAliasRecords(topicId, options)
  return { results: results.map(result => result.alias), hasNextPage }
}

export async function getTopicAliasRecordByValue(
  topicId: string,
  alias: string,
): Promise<{ id: string; alias: string; topic_id: string } | undefined> {
  const { rows } = await read<{ id: string; alias: string; topic_id: string }>(
    `/* getTopicAliasRecordByValue */
      SELECT id, alias, topic_id
      FROM topic_aliases
      WHERE topic_id = $1 AND alias = LOWER($2)
      LIMIT 1`,
    [topicId, alias],
  )
  return rows[0]
}
