import type { OwnedTransaction } from '@data-stores/psql'
import type { ClassifierRunLease, ClassifierRunOutcomes } from '@services/classifier-runs'
import {
  createStoryFromPair,
  isClusterable,
  joinExistingStory,
  lockClusterItem,
  type StoryClusteringEffects,
} from './membership.mts'
import { selectStoryClusteringOutcome } from './selection.mts'

/**
 * Turns a durable story-clustering decision into membership, inside the transaction that completes
 * the run (the item is already locked by the run's own current-content check). Everything is
 * re-read under row locks, so a concurrent change since the decision is applied as a no-op, never as
 * a wrong join: an item that left, was locked or already joined a story is skipped, and a chosen
 * standalone item that has meanwhile joined a story brings the incoming item into that story.
 *
 * This is the only code that moves an item into a story. It never writes `official_rss_feed_item_id`
 * (membership-only), so it can never override an admin's `official_locked_at`.
 */
export async function applyStoryClusteringEffects(
  query: OwnedTransaction,
  lease: ClassifierRunLease<unknown>,
  outcomes: ClassifierRunOutcomes<never>,
): Promise<StoryClusteringEffects> {
  const subjectId = lease.subject.rssFeedItemId
  if (subjectId === null || outcomes.remoteDecision === null) return { kind: 'none' }
  const outcome = selectStoryClusteringOutcome(outcomes.remoteDecision.results)
  if (outcome.kind === 'none') return { kind: 'none' }
  const incoming = await lockClusterItem(query, subjectId)
  if (!incoming || !isClusterable(incoming)) return { kind: 'skipped', reason: 'item_unavailable' }
  if (outcome.kind === 'existing_story') {
    return joinExistingStory(query, incoming.id, outcome.storyId)
  }
  const selected = await lockClusterItem(query, outcome.rssFeedItemId)
  if (!selected || selected.story_locked_at !== null) {
    return { kind: 'skipped', reason: 'candidate_unavailable' }
  }
  if (selected.story_id !== null) return joinExistingStory(query, incoming.id, selected.story_id)
  return createStoryFromPair(query, incoming, selected)
}
