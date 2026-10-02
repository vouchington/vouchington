import type { ClassifierRunRemoteInput } from '@agents/classifier-runs'
import type { ClassifierRunLease } from '@services/classifier-runs'
import { getRssFeedItemsByIdBatch } from '@services/rss-feed-items/get-batch'
import type { ViewRssFeedItem } from '@services/rss-feed-items/types'
import {
  readStoryClusteringRepresentatives,
  type StoryClusteringRunConfiguration,
} from '@services/stories'
import { buildStoryClusteringBindings } from './bindings.mts'

/**
 * The remote input of a story-clustering run: one Choice question over the incoming article and
 * the candidates the run captured when its receipt was reserved. Reading the captured candidates,
 * not a fresh embedding search, is what keeps a retry, lease reclaim or replay asking the question
 * it first reserved. Null when the receipt captured no candidates: with nothing to choose between,
 * the run has no remote work and completes without a provider call.
 */
export async function buildStoryClusteringRunInput(
  lease: ClassifierRunLease<StoryClusteringRunConfiguration>,
  incomingItem: ViewRssFeedItem,
): Promise<ClassifierRunRemoteInput | null> {
  const { remote, configuration } = lease.resolved
  if (remote?.candidateKind !== 'story') {
    throw new Error('story clustering run must capture its own candidates')
  }
  if (lease.capturedStoryCandidates.length === 0) return null
  const representatives = await readStoryClusteringRepresentatives(
    lease.subject,
    lease.capturedStoryCandidates,
  )
  const itemIds = representatives.flatMap(({ rssFeedItemId }) =>
    rssFeedItemId === null ? [] : [rssFeedItemId],
  )
  const items = await getRssFeedItemsByIdBatch(itemIds, { readOnly: false })
  const itemsById = new Map(items.flatMap(item => (item ? ([[item.id, item]] as const) : [])))
  const { bindings, state } = await buildStoryClusteringBindings({
    incomingItem,
    candidates: representatives.map(({ candidate, rssFeedItemId, storyPublishedAt }) => ({
      candidate,
      item: rssFeedItemId === null ? null : (itemsById.get(rssFeedItemId) ?? null),
      storyPublishedAt,
    })),
    promptTemplate: configuration.prompt,
  })
  return {
    classifierId: remote.classifierId,
    promptVersionId: remote.promptVersionId,
    subject: lease.subject,
    scope: remote.scope,
    state,
    bindings,
  }
}
