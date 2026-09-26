import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { deriveNewStoryMetadata } from '@agents/story-clustering'
import { lockStoryLifecycles } from '@services/post-publication/story-lifecycle-lock'
import { createStory } from './create.mts'
import type { ClusterItemRow } from './cluster-fetch.mts'
import { StoryRaceConditionError } from './cluster-error.mts'
import { recordStoryPostPublicationChanges } from './publication-change.mts'
import type { StoryPostRefreshResult } from './refresh-story-post.mts'
import type { ClusterDependencies, ClusterResult } from './cluster-types.mts'

type LockedPairRow = {
  id: string
  story_id: string | null
  story_locked_at: Date | null
  deleted_at: Date | null
  published_at: Date
  title: string | null
}

async function createAndLockStory(
  query: TransactionQuery,
  input: Parameters<typeof createStory>[0],
) {
  const story = await createStory(input, { query })
  await lockStoryLifecycles(query, [story.id])
  return story
}

/**
 * Creates a brand-new story from exactly two members -- the incoming item and the standalone item
 * the Choice classifier selected -- and atomically claims both, or claims neither.
 *
 * The old per-decision agent could nominate a whole subset of prefetched candidates as a story's
 * members; its combined-story-creation code locked every candidate row up front but only ever
 * checked the *incoming* item's own claim UPDATE result, never the candidates' -- a candidate
 * claimed by a concurrent operation between the lock and that second UPDATE was silently dropped
 * from the new story, which was created anyway with fewer members than intended. A Choice decision
 * only ever names one opposing member, so there is no partial-membership case to paper over: this
 * locks both rows up front (ordered by id, so two of these pair-creations racing on the same two
 * items in reverse order can't deadlock), derives the story's metadata from that locked read, and
 * then re-checks both claims via a single UPDATE whose result must cover both ids -- if it doesn't,
 * the whole attempt (including the just-inserted story row) rolls back with `StoryRaceConditionError`,
 * and the caller (`cluster.mts`) treats that exactly like "no clustering action for this item".
 */
export async function createClusteredStoryPair(
  item: ClusterItemRow,
  selectedItemId: string,
  dependencies: ClusterDependencies,
): Promise<ClusterResult | null> {
  try {
    const { clusterResult, refreshResult } = await createClusteredStoryPairInTransaction(
      item,
      selectedItemId,
      dependencies,
    )
    await dependencies.completeClusteredStory(clusterResult.storyId, refreshResult)
    return clusterResult
  } catch (error) {
    if (error instanceof StoryRaceConditionError) return null
    throw error
  }
}

async function createClusteredStoryPairInTransaction(
  item: ClusterItemRow,
  selectedItemId: string,
  dependencies: ClusterDependencies,
): Promise<{ clusterResult: ClusterResult; refreshResult: StoryPostRefreshResult | null }> {
  await using query = await beginTransaction()
  const options = { query }
  const pairIds = [item.id, selectedItemId].sort()

  const { rows: locked } = await write(
    sql`/* createClusteredStoryPair:lockPair */
        SELECT id, story_id, story_locked_at, deleted_at, published_at, data->>'title' AS title
        FROM rss_feed_items
        WHERE id = ANY(${pairIds}::uuid[])
        ORDER BY id
        FOR UPDATE
      `,
    options,
  )
  const byId = new Map((locked as LockedPairRow[]).map(row => [row.id, row]))
  const selectedRow = byId.get(selectedItemId)
  const incomingRow = byId.get(item.id)
  if (!selectedRow || !incomingRow) throw new StoryRaceConditionError()
  if (
    selectedRow.deleted_at ||
    selectedRow.story_id ||
    selectedRow.story_locked_at ||
    incomingRow.deleted_at ||
    incomingRow.story_id ||
    incomingRow.story_locked_at
  ) {
    throw new StoryRaceConditionError()
  }

  const metadata = deriveNewStoryMetadata({
    incomingPublishedAt: item.published_at,
    selectedItem: {
      title: selectedRow.title ?? undefined,
      published_at: selectedRow.published_at,
    },
  })
  const story = await createAndLockStory(query, {
    published_at: metadata.published_at,
    title: metadata.title,
    cluster_reason: metadata.cluster_reason,
  })

  const { rows: assigned } = await write(
    sql`/* createClusteredStoryPair:claimPair */
        UPDATE rss_feed_items
        SET story_id = ${story.id}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY(${pairIds}::uuid[])
          AND deleted_at IS NULL
          AND story_id IS NULL
          AND story_locked_at IS NULL
        RETURNING id
      `,
    options,
  )
  if (assigned.length !== 2) throw new StoryRaceConditionError()

  const refreshResult = await dependencies.refreshStoryPostForStory(story.id, options, {
    enqueueAgent: false,
  })
  await recordStoryPostPublicationChanges(query, story.id, refreshResult?.impactedTopicIds)
  const clusterResult = { storyId: story.id, created: true }
  await query.commit()
  return { clusterResult, refreshResult }
}
