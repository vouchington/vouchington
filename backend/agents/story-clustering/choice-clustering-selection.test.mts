import { describe, expect, it } from 'vitest'
import type { PersistedClassifierDecisionResult } from '@services/classifiers'
import { selectStoryClusteringOutcome } from './choice-clustering-selection.mts'

const SCOPE = { scopeCategory: 'global' as const, scopeCommunityId: null }
const THRESHOLDS = { lower: 0.65, upper: 0.95 }

function storyResult(
  storyId: string,
  probability: number,
  thresholds = THRESHOLDS,
): PersistedClassifierDecisionResult {
  return {
    candidateKind: 'story',
    storyId,
    storedCandidateId: null,
    probability,
    rawResponse: {},
    id: `result-${storyId}`,
    batchId: 'batch-1',
    decisionCallId: 'call-1',
    classifierId: 'classifier-1',
    promptVersionId: 'prompt-1',
    thresholdId: null,
    effectiveThresholds: thresholds,
    scope: SCOPE,
  }
}

function rssFeedItemResult(
  rssFeedItemId: string,
  probability: number,
  thresholds = THRESHOLDS,
): PersistedClassifierDecisionResult {
  return {
    candidateKind: 'rss_feed_item',
    rssFeedItemId,
    storedCandidateId: null,
    probability,
    rawResponse: {},
    id: `result-${rssFeedItemId}`,
    batchId: 'batch-1',
    decisionCallId: 'call-1',
    classifierId: 'classifier-1',
    promptVersionId: 'prompt-1',
    thresholdId: null,
    effectiveThresholds: thresholds,
    scope: SCOPE,
  }
}

describe('selectStoryClusteringOutcome', () => {
  it('returns none when no result clears its own threshold', () => {
    const outcome = selectStoryClusteringOutcome([
      storyResult('story-1', 0.4),
      rssFeedItemResult('item-1', 0.5),
    ])
    expect(outcome).toEqual({ kind: 'none' })
  })

  it('returns none for an empty result list', () => {
    expect(selectStoryClusteringOutcome([])).toEqual({ kind: 'none' })
  })

  it('selects an existing-story result exactly at its own threshold (inclusive gate)', () => {
    const outcome = selectStoryClusteringOutcome([storyResult('story-1', 0.65)])
    expect(outcome).toEqual({ kind: 'existing_story', storyId: 'story-1' })
  })

  it('does not select a result just below its own threshold', () => {
    const outcome = selectStoryClusteringOutcome([storyResult('story-1', 0.6499999)])
    expect(outcome).toEqual({ kind: 'none' })
  })

  it('selects a standalone rss_feed_item result that clears threshold', () => {
    const outcome = selectStoryClusteringOutcome([rssFeedItemResult('item-1', 0.9)])
    expect(outcome).toEqual({ kind: 'standalone', rssFeedItemId: 'item-1' })
  })

  it('compares each result against its own effectiveThresholds, not a shared default', () => {
    const outcome = selectStoryClusteringOutcome([
      storyResult('story-1', 0.55, { lower: 0.5, upper: 0.95 }),
      rssFeedItemResult('item-1', 0.6, { lower: 0.65, upper: 0.95 }),
    ])
    expect(outcome).toEqual({ kind: 'existing_story', storyId: 'story-1' })
  })

  it('defensively picks the highest-probability result if more than one clears threshold', () => {
    const outcome = selectStoryClusteringOutcome([
      storyResult('story-1', 0.7),
      rssFeedItemResult('item-1', 0.9),
    ])
    expect(outcome).toEqual({ kind: 'standalone', rssFeedItemId: 'item-1' })
  })

  it('breaks an exact probability tie deterministically by candidate key', () => {
    const first = selectStoryClusteringOutcome([
      storyResult('story-b', 0.8),
      storyResult('story-a', 0.8),
    ])
    const second = selectStoryClusteringOutcome([
      storyResult('story-a', 0.8),
      storyResult('story-b', 0.8),
    ])
    expect(first).toEqual(second)
    expect(first).toEqual({ kind: 'existing_story', storyId: 'story-a' })
  })

  it('ignores a topic result, which should never appear for this classifier family', () => {
    const topicResult = {
      candidateKind: 'topic' as const,
      topicId: 'topic-1',
      storedCandidateId: null,
      probability: 0.99,
      rawResponse: {},
      id: 'result-topic-1',
      batchId: 'batch-1',
      decisionCallId: 'call-1',
      classifierId: 'classifier-1',
      promptVersionId: 'prompt-1',
      thresholdId: null,
      effectiveThresholds: THRESHOLDS,
      scope: SCOPE,
    }
    const outcome = selectStoryClusteringOutcome([topicResult])
    expect(outcome).toEqual({ kind: 'none' })
  })
})
