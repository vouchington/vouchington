import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { Story, StoryWithItemCount } from './types.mts'

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

export async function getStoryWithItemCount(
  id: string,
  options: QueryOptions = {},
): Promise<StoryWithItemCount | null> {
  const { rows } = await read(
    sql`/* getStoryWithItemCount */
    SELECT
      s.id,
      s.title,
      s.cluster_reason,
      s.published_at,
      s.official_rss_feed_item_id,
      s.official_locked_at,
      uuid_extract_timestamp(s.id) AS created_at,
      s.updated_at,
      s.deleted_at,
      COUNT(rfi.id)::int AS item_count
    FROM stories s
    LEFT JOIN rss_feed_items rfi ON rfi.story_id = s.id AND rfi.deleted_at IS NULL
    WHERE s.id = ${id}
      AND s.deleted_at IS NULL
    GROUP BY s.id
    LIMIT 1
  `,
    options,
  )
  return (rows[0] as StoryWithItemCount) ?? null
}

export async function getStoryItemIds(
  storyId: string,
  options: QueryOptions = {},
): Promise<string[]> {
  const { rows } = await read(
    sql`/* getStoryItemIds */
    SELECT id
    FROM rss_feed_items
    WHERE story_id = ${storyId}
      AND deleted_at IS NULL
    ORDER BY id DESC
  `,
    options,
  )
  return rows.map(r => r.id as string)
}

export async function getStoriesByIdBatch(
  ids: string[],
  options: QueryOptions = {},
): Promise<Array<Story | null>> {
  if (ids.length === 0) return []

  const { rows } = await read(
    sql`/* getStoriesByIdBatch */
    SELECT
      s.id,
      s.title,
      s.cluster_reason,
      s.published_at,
      s.official_rss_feed_item_id,
      s.official_locked_at,
      uuid_extract_timestamp(s.id) AS created_at,
      s.updated_at,
      s.deleted_at,
      input.ord
    FROM UNNEST(${ids}::uuid[]) WITH ORDINALITY AS input(id, ord)
    JOIN stories s ON s.id = input.id AND s.deleted_at IS NULL
    ORDER BY input.ord
  `,
    options,
  )

  const byId = new Map<string, Story>()
  for (const row of rows) {
    const { ord: _ord, ...story } = row as Story & { ord: number }
    byId.set(story.id, story)
  }
  return ids.map(id => byId.get(id) ?? null)
}

export async function getItemIdsByStoryIds(
  storyIds: string[],
  options: QueryOptions = {},
): Promise<Record<string, string[]>> {
  if (storyIds.length === 0) return {}

  const { rows } = await read(
    sql`/* getItemIdsByStoryIds */
    SELECT story_id, id
    FROM rss_feed_items
    WHERE story_id = ANY(${storyIds}::uuid[])
      AND deleted_at IS NULL
    ORDER BY id DESC
  `,
    options,
  )

  const result: Record<string, string[]> = {}
  for (const row of rows) {
    const storyId = row.story_id as string
    const itemId = row.id as string
    if (!result[storyId]) result[storyId] = []
    result[storyId].push(itemId)
  }
  return result
}

export type StoryItemSummary = {
  title: string
  summary: string
}

export async function getStoryItemSummaries(
  storyId: string,
  options: QueryOptions = {},
): Promise<StoryItemSummary[]> {
  const { rows } = await read(
    sql`/* getStoryItemSummaries */
    SELECT
      JSON_AGG(
        json_build_object(
          'title',
          rfi.data->>'title',
          'summary',
          COALESCE(
            NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(rfi.data->>'contentSnippet', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
            NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(rfi.data->>'summary', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
            NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(rfi.data->>'description', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
            NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(rfi.data->>'media:description', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
            ''
          )
        )
        ORDER BY rfi.published_at ASC
      ) FILTER (WHERE rfi.data->>'title' IS NOT NULL AND rfi.data->>'title' <> '') AS item_summaries
    FROM rss_feed_items rfi
    WHERE rfi.story_id = ${storyId}
      AND rfi.deleted_at IS NULL
  `,
    options,
  )
  return (rows[0]?.item_summaries as StoryItemSummary[] | null) ?? []
}
