import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { Story } from '@voucha/types/entities/story'
import sql from 'sql-template-strings'

export async function getStoryById(id: string, options: QueryOptions = {}): Promise<Story | null> {
  const { rows } = await read(
    sql`/* getStoryById */
    SELECT
      id,
      title,
      cluster_reason,
      published_at,
      official_rss_feed_item_id,
      official_locked_at,
      uuid_extract_timestamp(id) AS created_at,
      updated_at,
      deleted_at
    FROM stories
    WHERE id = ${id}
      AND deleted_at IS NULL
    LIMIT 1
  `,
    options,
  )
  return (rows[0] as Story) ?? null
}
