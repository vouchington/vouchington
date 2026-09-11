import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { Story } from './types.mts'

export type CreateStoryOptions = {
  published_at?: Date
  title?: string
  cluster_reason?: string
}

export async function createStory(
  storyOptions: CreateStoryOptions = {},
  options: QueryOptions = {},
): Promise<Story> {
  const { rows } = await write(
    sql`/* createStory */
    INSERT INTO stories (title, published_at, cluster_reason)
    VALUES (${storyOptions.title ?? null}, ${storyOptions.published_at ?? null}, ${storyOptions.cluster_reason ?? null})
    RETURNING
      id,
      title,
      cluster_reason,
      published_at,
      official_rss_feed_item_id,
      official_locked_at,
      uuid_extract_timestamp(id) AS created_at,
      updated_at,
      deleted_at
  `,
    options,
  )
  return rows[0] as Story
}
