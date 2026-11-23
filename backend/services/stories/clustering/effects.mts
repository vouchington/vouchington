import type { OwnedTransaction } from '@data-stores/psql'
import type { ClassifierRunLease, ClassifierRunOutcomes } from '@services/classifier-runs'
import {
  createStoryFromPair,
  isClusterable,
  joinExistingStory,
  readClusterItem,
  type StoryClusteringEffects,
} from './membership.mts'
import { selectStoryClusteringOutcome } from './selection.mts'

/**
 * Turns a durable story-clustering decision into membership, inside the transaction that completes
 * the run. Membership writes recheck item availability. If a standalone candidate has already
 * joined a story, the incoming item can join that live story while the candidate remains a member.
 *
 * Classifier membership writes leave `official_rss_feed_item_id` and `official_locked_at` unchanged.
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
  if (outcome.kind === 'existing_story')
    return joinExistingStory(query, subjectId, outcome.storyId, lease.inputSha256)
  const incoming = await readClusterItem(query, subjectId)
  if (!incoming || !isClusterable(incoming)) return { kind: 'skipped', reason: 'item_unavailable' }
  const selected = await readClusterItem(query, outcome.rssFeedItemId)
  if (!selected || selected.story_locked_at !== null) {
    return { kind: 'skipped', reason: 'candidate_unavailable' }
  }
  if (selected.story_id !== null)
    return joinExistingStory(query, incoming.id, selected.story_id, lease.inputSha256, selected.id)
  return createStoryFromPair(query, incoming, selected, lease.inputSha256)
}
