import type { OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createStory } from '../create.mts'
import { recordStoryPostPublicationChanges } from '../publication-change.mts'
import { refreshStoryPostForStory } from '../refresh-story-post.mts'
import { deriveNewStoryMetadata } from './metadata.mts'

type ClusterItem = {
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

export async function readClusterItem(
  query: OwnedTransaction,
  rssFeedItemId: string,
): Promise<ClusterItem | null> {
  const { rows } = await query<ClusterItem>(
    sql`/* readStoryClusteringItem */
    SELECT id, story_id, story_locked_at, published_at, data->>'title' AS title
    FROM rss_feed_items
    WHERE id = ${rssFeedItemId} AND deleted_at IS NULL`,
  )
  return rows[0] ?? null
}

/** An item that can still be moved into a story: not in one, and not locked out by an admin. */
export function isClusterable(item: ClusterItem): boolean {
  return item.story_id === null && item.story_locked_at === null
}

/**
 * Refreshes the story's post and records the publication change in the same transaction as the
 * membership change, so a story post can never show membership that did not commit.
 */
async function refreshClusteredStory(query: OwnedTransaction, storyId: string): Promise<void> {
  const result = await refreshStoryPostForStory(storyId, { query })
  await recordStoryPostPublicationChanges(query, storyId, result?.impactedTopicIds)
}

/** Adds an eligible item to a story that is live at the membership write's snapshot. */
export async function joinExistingStory(
  query: OwnedTransaction,
  itemId: string,
  storyId: string,
  inputSha256: Buffer,
  candidateId?: string,
): Promise<StoryClusteringEffects> {
  const assigned = await query(sql`/* assignStoryClusteringItem */
    UPDATE rss_feed_items
    SET story_id = ${storyId}
    WHERE id = ${itemId} AND deleted_at IS NULL AND story_id IS NULL AND story_locked_at IS NULL
      AND bedrock_nova_multimodal_v1_content_sha256 = ${inputSha256}
      AND EXISTS (
        SELECT 1 FROM stories WHERE id = ${storyId} AND deleted_at IS NULL
      )
      AND (
        ${candidateId ?? null}::uuid IS NULL OR EXISTS (
          SELECT 1 FROM rss_feed_items candidate
          WHERE candidate.id = ${candidateId ?? null}::uuid
            AND candidate.story_id = ${storyId}
            AND candidate.deleted_at IS NULL AND candidate.story_locked_at IS NULL
        )
      )`)
  if (assigned.rowCount !== 1) {
    const { rows } = await query(sql`/* joinStoryClusteringStory */
      SELECT id FROM stories WHERE id = ${storyId} AND deleted_at IS NULL`)
    if (rows.length === 0) return { kind: 'skipped', reason: 'story_unavailable' }
    return { kind: 'skipped', reason: candidateId ? 'candidate_unavailable' : 'item_unavailable' }
  }
  await refreshClusteredStory(query, storyId)
  return { kind: 'joined', storyId }
}

/** Founds a story from two clusterable items; both must land in it or neither does. */
export async function createStoryFromPair(
  query: OwnedTransaction,
  incoming: ClusterItem,
  selected: ClusterItem,
  inputSha256: Buffer,
): Promise<StoryClusteringEffects> {
  const metadata = deriveNewStoryMetadata({
    incomingPublishedAt: incoming.published_at,
    selectedItem: selected,
  })
  const story = await createStory(metadata, { query })
  const assigned = await query(sql`/* assignStoryClusteringPair */
    UPDATE rss_feed_items
    SET story_id = ${story.id}
    WHERE id = ANY(${[incoming.id, selected.id]}::uuid[])
      AND deleted_at IS NULL AND story_id IS NULL AND story_locked_at IS NULL
      AND (id <> ${incoming.id} OR bedrock_nova_multimodal_v1_content_sha256 = ${inputSha256})
      AND EXISTS (SELECT 1 FROM stories WHERE id = ${story.id} AND deleted_at IS NULL)
  `)
  if (assigned.rowCount !== 2)
    throw new Error('Story clustering could not assign both founding members')
  await refreshClusteredStory(query, story.id)
  return { kind: 'created', storyId: story.id }
}
