import type { OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createStory } from '../create.mts'
import { recordStoryPostPublicationChanges } from '../publication-change.mts'
import { refreshStoryPostForStory } from '../refresh-story-post.mts'
import { deriveNewStoryMetadata } from './metadata.mts'

/** A live RSS item read under its row lock, so what is checked here cannot change before commit. */
type LockedClusterItem = {
  id: string
  story_id: string | null
  story_locked_at: Date | null
  published_at: Date
  title: string | undefined
}

export type StoryClusteringEffects =
  | { kind: 'none' }
  | { kind: 'skipped'; reason: 'item_unavailable' | 'candidate_unavailable' | 'story_unavailable' }
  | { kind: 'joined'; storyId: string }
  | { kind: 'created'; storyId: string }

export async function lockClusterItem(
  query: OwnedTransaction,
  rssFeedItemId: string,
): Promise<LockedClusterItem | null> {
  const { rows } = await query<LockedClusterItem>(
    sql`/* lockStoryClusteringItem */
    SELECT id, story_id, story_locked_at, published_at, data->>'title' AS title
    FROM rss_feed_items
    WHERE id = ${rssFeedItemId} AND deleted_at IS NULL
    FOR UPDATE`,
  )
  return rows[0] ?? null
}

/** An item that can still be moved into a story: not in one, and not locked out by an admin. */
export function isClusterable(item: LockedClusterItem): boolean {
  return item.story_id === null && item.story_locked_at === null
}

async function assignItemsToStory(
  query: OwnedTransaction,
  storyId: string,
  itemIds: readonly string[],
): Promise<number> {
  const { rows } = await query(
    sql`/* assignStoryClusteringItems */
    UPDATE rss_feed_items
    SET story_id = ${storyId}
    WHERE id = ANY(${[...itemIds]}::uuid[])
      AND deleted_at IS NULL AND story_id IS NULL AND story_locked_at IS NULL
      AND EXISTS (SELECT 1 FROM stories WHERE id = ${storyId} AND deleted_at IS NULL)
    RETURNING id`,
  )
  return rows.length
}

/**
 * Refreshes the story's post and records the publication change in the same transaction as the
 * membership change, so a story post can never show membership that did not commit.
 */
async function refreshClusteredStory(query: OwnedTransaction, storyId: string): Promise<void> {
  const result = await refreshStoryPostForStory(storyId, { query })
  await recordStoryPostPublicationChanges(query, storyId, result?.impactedTopicIds)
}

/** Adds the locked, clusterable item to a story that is live when the membership write starts. */
export async function joinExistingStory(
  query: OwnedTransaction,
  itemId: string,
  storyId: string,
): Promise<StoryClusteringEffects> {
  const assigned = await assignItemsToStory(query, storyId, [itemId])
  if (assigned === 0) return { kind: 'skipped', reason: 'story_unavailable' }
  await refreshClusteredStory(query, storyId)
  return { kind: 'joined', storyId }
}

/** Founds a story from two locked, clusterable items; both must land in it or neither does. */
export async function createStoryFromPair(
  query: OwnedTransaction,
  incoming: LockedClusterItem,
  selected: LockedClusterItem,
): Promise<StoryClusteringEffects> {
  const metadata = deriveNewStoryMetadata({
    incomingPublishedAt: incoming.published_at,
    selectedItem: selected,
  })
  const story = await createStory(metadata, { query })
  const assigned = await assignItemsToStory(query, story.id, [incoming.id, selected.id])
  if (assigned !== 2) throw new Error('Story clustering could not assign both founding members')
  await refreshClusteredStory(query, story.id)
  return { kind: 'created', storyId: story.id }
}
