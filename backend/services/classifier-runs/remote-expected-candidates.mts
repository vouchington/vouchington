import type {
  ClassifierDecisionInputResult,
  PersistedClassifierDecision,
  PersistedClassifierDecisionResult,
} from '@services/classifiers/types'
import type { ClassifierRunLease, RemotePlan } from './types.mts'

export type ExpectedCandidate = { thresholdId: string | null; lower: number; upper: number } | null

/**
 * The exact candidates a run may ask about, keyed by kind, entity and stored candidate. Pinned
 * topics carry the thresholds the configuration froze. Captured topics, stories, standalone items
 * and community prompts carry none: they have no stored candidate and are judged by the thresholds
 * the decision itself recorded.
 */
export function expectedCandidates<C>(
  lease: ClassifierRunLease<C>,
  remote: RemotePlan,
): Map<string, ExpectedCandidate> {
  if (remote.candidateKind === 'community_prompt') {
    return new Map(remote.promptIds.map(promptId => [`community_prompt:${promptId}`, null]))
  }
  if (remote.candidateKind === 'story') {
    return new Map(
      lease.capturedStoryCandidates.map(candidate => [
        candidate.kind === 'story'
          ? `story:${candidate.storyId}`
          : `rss_feed_item:${candidate.rssFeedItemId}`,
        null,
      ]),
    )
  }
  if (remote.capturedCandidates) {
    return new Map(lease.capturedTopicIds.map(topicId => [`topic:${topicId}:`, null]))
  }
  return new Map(
    remote.candidates.map(candidate => [
      `topic:${candidate.topicId}:${candidate.candidateId}`,
      candidate,
    ]),
  )
}

export function resultKey(
  result: ClassifierDecisionInputResult | PersistedClassifierDecisionResult,
): string {
  switch (result.candidateKind) {
    case 'topic':
      return `topic:${result.topicId}:${result.storedCandidateId ?? ''}`
    case 'story':
      return `story:${result.storyId}`
    case 'rss_feed_item':
      return `rss_feed_item:${result.rssFeedItemId}`
    case 'community_prompt':
      return `community_prompt:${result.communityPromptId}`
  }
}

export function matchesExpectedThresholds(
  candidate: ExpectedCandidate,
  result: PersistedClassifierDecision['results'][number],
): boolean {
  return (
    candidate === null ||
    (result.thresholdId === candidate.thresholdId &&
      result.effectiveThresholds.lower === candidate.lower &&
      result.effectiveThresholds.upper === candidate.upper)
  )
}
