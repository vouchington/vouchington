import {
  classifierDecisionResultKey,
  type PersistedClassifierDecisionResult,
} from '@services/classifiers'

export type StoryClusteringOutcome =
  | { kind: 'none' }
  | { kind: 'existing_story'; storyId: string }
  | { kind: 'standalone'; rssFeedItemId: string }

type StoryFamilyResult = Extract<
  PersistedClassifierDecisionResult,
  { candidateKind: 'story' | 'rss_feed_item' }
>

function isCleared(result: PersistedClassifierDecisionResult): result is StoryFamilyResult {
  if (result.candidateKind !== 'story' && result.candidateKind !== 'rss_feed_item') return false
  return result.probability >= result.effectiveThresholds.lower
}

function outcomeFor(result: StoryFamilyResult): StoryClusteringOutcome {
  return result.candidateKind === 'story'
    ? { kind: 'existing_story', storyId: result.storyId }
    : { kind: 'standalone', rssFeedItemId: result.rssFeedItemId }
}

/**
 * Turns a persisted Choice decision into what the classified item does. Only a bound candidate whose
 * own probability reaches its own row's lower threshold (the prompt version's default at the time of
 * the decision, never a later configuration) is a match; the unbound `none` option never produces a
 * row, so choosing it, a low-confidence answer or a missing row all select nothing. Failing closed
 * means a malformed or partial answer can never join an item to a story.
 *
 * With at most six criteria (five candidates plus `none`) and a lower threshold above 0.5, two bound
 * criteria cannot both clear it, so at most one row clears. The pick is still deterministic if an
 * out-of-band decision says otherwise: highest probability, then the smallest candidate key.
 */
export function selectStoryClusteringOutcome(
  results: readonly PersistedClassifierDecisionResult[],
): StoryClusteringOutcome {
  const cleared = results.filter(isCleared)
  if (cleared.length === 0) return { kind: 'none' }
  const winner = cleared.reduce((best, result) => {
    if (result.probability !== best.probability) {
      return result.probability > best.probability ? result : best
    }
    return classifierDecisionResultKey(result) < classifierDecisionResultKey(best) ? result : best
  })
  return outcomeFor(winner)
}
