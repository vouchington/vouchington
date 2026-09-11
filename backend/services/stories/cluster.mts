import { write, beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { fetchClusterItem, type ClusterItemRow } from './cluster-fetch.mts'
import { findClusterCandidates, type CandidateRow } from './cluster-candidates.mts'
import { createStory } from './create.mts'
import { setStoryOfficialItem } from './update.mts'
import { runStoryClusteringAgent, type ClusteringAgentResult } from '@agents/story-clustering'
import { completeClusteredStory } from './cluster-completion.mts'
import { StoryRaceConditionError } from './cluster-error.mts'
import { recordStoryPostPublicationChanges } from './publication-change.mts'
import { refreshStoryPostForStory, type StoryPostRefreshResult } from './refresh-story-post.mts'
import { lockStoryLifecycles } from '@services/post-publication/story-lifecycle-lock'
import { replayClusteredStory } from './cluster-retry.mts'
export type ClusterResult = {
  storyId: string
  created: boolean
}
type ClusterDependencies = {
  runStoryClusteringAgent: typeof runStoryClusteringAgent
  refreshStoryPostForStory: typeof refreshStoryPostForStory
  completeClusteredStory: typeof completeClusteredStory
}
type ClusterDependencyOverrides = Partial<ClusterDependencies>
const defaultClusterDependencies: ClusterDependencies = {
  runStoryClusteringAgent,
  refreshStoryPostForStory,
  completeClusteredStory,
}
async function createAndLockStory(
  query: TransactionQuery,
  input: Parameters<typeof createStory>[0],
) {
  const story = await createStory(input, { query })
  await lockStoryLifecycles(query, [story.id])
  return story
}
export async function clusterRssFeedItem(
  rss_feed_item_id: string,
  dependencyOverrides: ClusterDependencyOverrides = {},
): Promise<ClusterResult | null> {
  const dependencies = { ...defaultClusterDependencies, ...dependencyOverrides }
  const item = await fetchClusterItem(rss_feed_item_id)
  if (!item) return null
  if (item.deleted_at) return null
  if (item.story_locked_at) return null
  if (!item.has_embedding) return null
  if (item.story_id) {
    await replayClusteredStory(
      item.story_id,
      dependencies.refreshStoryPostForStory,
      dependencies.completeClusteredStory,
    )
    return { storyId: item.story_id, created: false }
  }
  if (!item.is_cluster_eligible) return null
  const candidates = await findClusterCandidates(item)
  if (candidates.length === 0) return null
  const agentResult = await dependencies.runStoryClusteringAgent(item.id, candidates)
  if (!agentResult || !agentResult.should_cluster) return null
  const pickedCandidates = candidates.filter(c => agentResult.cluster_item_ids.includes(c.id))
  if (pickedCandidates.length === 0) return null
  const existingStoryCandidate = pickedCandidates.find(c => c.story_id != null)
  if (existingStoryCandidate?.story_id) {
    return assignItemToExistingStory(item, existingStoryCandidate.story_id, dependencies)
  }
  return createClusteredStory(item, pickedCandidates, agentResult, dependencies)
}
async function assignItemToExistingStory(
  item: ClusterItemRow,
  storyId: string,
  dependencies: ClusterDependencies,
): Promise<ClusterResult | null> {
  let refreshResult: StoryPostRefreshResult | null = null
  await using query = await beginTransaction()
  const locked = await query(
    sql`/* clusterRssFeedItem:lockItem */
        SELECT id FROM rss_feed_items
        WHERE id = ${item.id} AND deleted_at IS NULL AND story_id IS NULL AND story_locked_at IS NULL
        FOR UPDATE`,
  )
  let result = locked
  if (locked.rows.length > 0) {
    await lockStoryLifecycles(query, [storyId])
    result = await query(
      sql`/* clusterRssFeedItem */
    UPDATE rss_feed_items
    SET story_id = ${storyId}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${item.id}
      AND deleted_at IS NULL
      AND story_id IS NULL
      AND story_locked_at IS NULL
    RETURNING id
      `,
    )
    if (result.rows.length > 0) {
      refreshResult = await dependencies.refreshStoryPostForStory(
        storyId,
        { query },
        { enqueueAgent: false },
      )
      await recordStoryPostPublicationChanges(query, storyId, refreshResult?.impactedTopicIds)
    }
  }
  const { rows } = result
  await query.commit()
  if (rows.length === 0) return null
  await dependencies.completeClusteredStory(storyId, refreshResult)
  return { storyId, created: false }
}

async function createClusteredStory(
  item: ClusterItemRow,
  pickedCandidates: CandidateRow[],
  agentResult: ClusteringAgentResult,
  dependencies: ClusterDependencies,
): Promise<ClusterResult | null> {
  try {
    const { clusterResult, refreshResult } = await createClusteredStoryInTransaction(
      item,
      pickedCandidates,
      agentResult,
      dependencies,
    )
    await dependencies.completeClusteredStory(clusterResult.storyId, refreshResult)
    return clusterResult
  } catch (error) {
    if (error instanceof StoryRaceConditionError) return null
    throw error
  }
}

async function createClusteredStoryInTransaction(
  item: ClusterItemRow,
  pickedCandidates: CandidateRow[],
  agentResult: ClusteringAgentResult,
  dependencies: ClusterDependencies,
): Promise<{ clusterResult: ClusterResult; refreshResult: StoryPostRefreshResult | null }> {
  await using query = await beginTransaction()
  const options = { query }
  const allItemIds = [...new Set([item.id, ...pickedCandidates.map(c => c.id)])]
  await write(
    sql`/* createClusteredStory */
        SELECT id FROM rss_feed_items
        WHERE id = ANY(${allItemIds}::uuid[])
        ORDER BY id
        FOR UPDATE
      `,
    options,
  )
  const publishedAt = agentResult.published_at ? new Date(agentResult.published_at) : undefined
  const story = await createAndLockStory(query, {
    published_at: publishedAt,
    title: agentResult.title,
    cluster_reason: agentResult.reason,
  })
  const { rows: assigned } = await write(
    sql`/* clusterRssFeedItem */
        UPDATE rss_feed_items
        SET story_id = ${story.id}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${item.id}
          AND deleted_at IS NULL
          AND story_id IS NULL
          AND story_locked_at IS NULL
        RETURNING id
      `,
    options,
  )
  if (assigned.length === 0) throw new StoryRaceConditionError()
  let assignedCandidateIds: string[] = []
  if (pickedCandidates.length > 0) {
    const candidateIds = pickedCandidates.map(c => c.id)
    const { rows: assignedCandidates } = await write(
      sql`/* clusterRssFeedItem */
          UPDATE rss_feed_items
          SET story_id = ${story.id}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ANY(${candidateIds}::uuid[])
            AND deleted_at IS NULL
            AND story_id IS NULL
            AND story_locked_at IS NULL
          RETURNING id
        `,
      options,
    )
    assignedCandidateIds = assignedCandidates.map(r => r.id as string)
  }
  const actualMemberIds = [item.id, ...assignedCandidateIds]
  if (
    agentResult.official_rss_feed_item_id &&
    actualMemberIds.includes(agentResult.official_rss_feed_item_id)
  ) {
    await setStoryOfficialItem(story.id, agentResult.official_rss_feed_item_id, options)
  }
  const refreshResult = await dependencies.refreshStoryPostForStory(story.id, options, {
    enqueueAgent: false,
  })
  await recordStoryPostPublicationChanges(query, story.id, refreshResult?.impactedTopicIds)
  const clusterResult = { storyId: story.id, created: true }
  await query.commit()
  return { clusterResult, refreshResult }
}
