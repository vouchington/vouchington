import onError from '@modules/on-error'
import { enqueueBulkClassifierRunDispatchers } from '@queues/ai-agents/enqueues/classifier-run'
import { STORY_CLUSTERING_CLASSIFIER_SLUG } from '@voucha/types/entities/story-clustering-classifier'

/**
 * Starts story clustering for items whose embedding just became current, without waiting for the
 * next sweep. The durable request row (written with the item's content) is what recovery uses, so
 * this enqueue is only a latency shortcut: it is best effort, deduplicated by a stable per-item
 * dispatcher job id, and a failure leaves the request for the sweep instead of failing the
 * embedding job that already stored its vector.
 */
export async function dispatchStoryClusteringForEmbeddedItems(
  rssFeedItemIds: readonly string[],
): Promise<void> {
  if (rssFeedItemIds.length === 0) return
  try {
    await enqueueBulkClassifierRunDispatchers(
      rssFeedItemIds.map(rssFeedItemId => ({
        classifier: STORY_CLUSTERING_CLASSIFIER_SLUG,
        postId: null,
        rssFeedItemId,
      })),
    )
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
  }
}
