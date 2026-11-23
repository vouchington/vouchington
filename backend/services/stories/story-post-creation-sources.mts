import { write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

type StoryPostCreationSources = {
  topic_ids: string[] | null
  item_count: string
}

export type StoryPostCreationSnapshot = StoryPostCreationSources & {
  sourceUpperBoundId: string | null
}

type CreationSourceRow = StoryPostCreationSources & {
  single_item_title?: string | null
  story_title?: string | null
  max_item_id?: string | null
}

export async function readStoryPostCreationSources(storyId: string, query?: TransactionQuery) {
  const statement = query
    ? sql`/* createStoryPost:items */`
    : sql`/* storyPostCreationSourcesChanged */`
  statement.append(sql`
    SELECT
      ARRAY_AGG(DISTINCT c.topic_id) FILTER (WHERE c.topic_id IS NOT NULL) AS topic_ids,
      COUNT(DISTINCT rfi.id) AS item_count`)
  if (query) {
    statement.append(sql`,
      MAX(CASE WHEN rfi.data->>'title' IS NOT NULL AND rfi.data->>'title' <> '' THEN rfi.data->>'title' END) AS single_item_title,
      s.title AS story_title`)
  } else {
    statement.append(sql`, MAX(rfi.id::text COLLATE "C") AS max_item_id`)
  }
  statement.append(sql`
    FROM stories s
    -- no-mistakes-disable-next-line postgres-required-predicates: story membership can attach already-created items, so item IDs may predate story_id
    LEFT JOIN rss_feed_items rfi ON rfi.story_id = s.id AND rfi.deleted_at IS NULL
    LEFT JOIN rss_feed_item_categories c ON c.rss_feed_item_id = rfi.id AND c.topic_id IS NOT NULL
    WHERE s.id = ${storyId}`)
  if (query) statement.append(sql` GROUP BY s.title`)
  const { rows } = query
    ? await query<CreationSourceRow>(statement)
    : await write<CreationSourceRow>(statement)
  return rows[0] ?? null
}

export async function storyPostCreationSourcesChanged(
  storyId: string,
  initial: StoryPostCreationSnapshot,
): Promise<boolean> {
  const current = await readStoryPostCreationSources(storyId)
  if (
    !current ||
    current.item_count !== initial.item_count ||
    current.max_item_id !== initial.sourceUpperBoundId
  )
    return true
  const initialTopicIds = new Set(initial.topic_ids)
  const currentTopicIds = current.topic_ids ?? []
  return (
    currentTopicIds.length !== initialTopicIds.size ||
    currentTopicIds.some(topicId => !initialTopicIds.has(topicId))
  )
}
