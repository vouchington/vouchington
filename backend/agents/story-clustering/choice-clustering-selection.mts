import type { PersistedClassifierDecisionResult } from '@services/classifiers'

export type StoryClusteringOutcome =
  | { kind: 'none' }
  | { kind: 'existing_story'; storyId: string }
  | { kind: 'standalone'; rssFeedItemId: string }

type StoryOrRssFeedItemResult = Extract<
  PersistedClassifierDecisionResult,
  { candidateKind: 'story' | 'rss_feed_item' }
>

function isClearedStoryFamilyResult(
  result: PersistedClassifierDecisionResult,
): result is StoryOrRssFeedItemResult {
  if (result.candidateKind !== 'story' && result.candidateKind !== 'rss_feed_item') return false
  return result.probability >= result.effectiveThresholds.lower
}

function resultKey(result: StoryOrRssFeedItemResult): string {
  return result.candidateKind === 'story'
    ? `story:${result.storyId}`
    : `rss_feed_item:${result.rssFeedItemId}`
}

function outcomeForResult(result: StoryOrRssFeedItemResult): StoryClusteringOutcome {
  return result.candidateKind === 'story'
    ? { kind: 'existing_story', storyId: result.storyId }
    : { kind: 'standalone', rssFeedItemId: result.rssFeedItemId }
}

/**
 * Selects the story-clustering outcome from a Choice decision's persisted results (one row per
 * bound candidate -- `choiceResults`, backend/agents/classifiers/results.mts -- the unbound `none`
 * criterion never produces a row at all). A row is "cleared" when its own `probability` meets or
 * exceeds its own per-row `effectiveThresholds.lower` -- never the classifier's global
 * `defaultThresholds`, since a story-scoped `effective_lower_threshold` override, or a prompt
 * version rotated between the original attempt and a native-retry replay, can make a row's
 * effective threshold differ from the currently-active configuration's default.
 *
 * The seed's threshold (0.6500, see 0730-00-02-seed-story-clustering-classifier.mts) makes it
 * mathematically impossible for two rows to both clear at once with at most 6 total criteria (5
 * candidates + `none`): two probabilities >= 0.6500 would already sum to >= 1.3, more than a
 * Choice answer's whole probability distribution. At most one row clearing is therefore a
 * structural guarantee, not an assumption this function relies on -- it still picks defensively
 * (highest probability, deterministic key tie-break) so a malformed or out-of-band response never
 * throws or picks arbitrarily.
 */
export function selectStoryClusteringOutcome(
  results: readonly PersistedClassifierDecisionResult[],
): StoryClusteringOutcome {
  const cleared = results.filter(isClearedStoryFamilyResult)
  if (cleared.length === 0) return { kind: 'none' }

  const winner = cleared.reduce((best, candidate) => {
    if (candidate.probability > best.probability) return candidate
    if (candidate.probability < best.probability) return best
    return resultKey(candidate) < resultKey(best) ? candidate : best
  })
  return outcomeForResult(winner)
}
