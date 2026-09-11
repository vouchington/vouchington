import type { ToolsTopicSearchResult } from './types.mts'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function toolsSearchTopicsText(
  query: string,
  limit: number,
): Promise<ToolsTopicSearchResult[]> {
  const safeLimit = Math.min(Math.max(1, limit), 25)

  // Search topics by text similarity
  const queryStatement = sql`/* toolsSearchTopicsText */
    SELECT
      t.id,
      t.name,
      t.slug,
      t.topic_type
    FROM topics t
    WHERE t.deleted_at IS NULL
      AND t.merged_into_topic_id IS NULL
      AND (t.name ILIKE ${`%${query}%`} OR t.slug ILIKE ${`%${query}%`})
    ORDER BY
      CASE
        WHEN t.name ILIKE ${`${query}%`} THEN 1
        WHEN t.slug ILIKE ${`${query}%`} THEN 2
        ELSE 3
      END,
      t.name
    LIMIT ${safeLimit}
  `

  const { rows } = await read(queryStatement)

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    topic_type: row.topic_type,
  }))
}
