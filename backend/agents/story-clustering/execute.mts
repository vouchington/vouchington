import {
  executeClassifierRun,
  type ClassifierRunExecution,
  type ClassifierRunProviderHooks,
} from '@agents/classifier-runs'
import type { StructuredDecisionClient } from '@modules/structured-decisions'
import type { ClassifierRunLease } from '@services/classifier-runs'
import { createRssFeedItemEmbeddingContent } from '@services/rss-feed-items/content'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import type { StoryClusteringRunAdapter, StoryClusteringRunConfiguration } from '@services/stories'
import { buildStoryClusteringRunInput } from './run-input.mts'

/**
 * Runs one leased story-clustering run. The shared classifier-run lifecycle reserves and caps the
 * provider attempt, records terminal failures, persists the decision and applies its membership
 * effects; this only loads the incoming article at the content the receipt is keyed on and builds
 * the Choice question from the run's captured candidates. An article that was deleted or whose
 * content has since changed is stale: a newer receipt owns it, so no model call is made here.
 */
export async function executeStoryClusteringRun(
  input: {
    adapter: StoryClusteringRunAdapter
    lease: ClassifierRunLease<StoryClusteringRunConfiguration>
    maxAttempts: number
    signal: AbortSignal
  },
  dependencies: {
    createClient: (hooks: ClassifierRunProviderHooks) => StructuredDecisionClient
  },
): Promise<ClassifierRunExecution> {
  const { adapter, lease } = input
  const { rssFeedItemId } = lease.subject
  if (rssFeedItemId === null) {
    throw new Error('story clustering run requires an RSS feed item subject')
  }
  const item = await getRssFeedItemById(rssFeedItemId, { readOnly: false })
  if (!item) return 'stale'
  if (!createRssFeedItemEmbeddingContent(item.data).content_sha256.equals(lease.inputSha256)) {
    return 'stale'
  }
  return executeClassifierRun(
    adapter,
    { lease, maxAttempts: input.maxAttempts, signal: input.signal },
    {
      buildRemoteInput: currentLease => buildStoryClusteringRunInput(currentLease, item),
      createClient: dependencies.createClient,
    },
  )
}
