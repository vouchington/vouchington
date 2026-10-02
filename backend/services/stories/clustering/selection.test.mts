import type { PersistedClassifierDecisionResult } from '@services/classifiers'
import { describe, expect, it } from 'vitest'
import { selectStoryClusteringOutcome } from './selection.mts'

const THRESHOLDS = { lower: 0.65, upper: 0.9 }

const base = {
  id: 'result',
  batchId: 'batch',
  decisionCallId: 'call',
  classifierId: 'classifier',
  promptVersionId: 'prompt',
  thresholdId: null,
  effectiveThresholds: THRESHOLDS,
  scope: { scopeCategory: 'global', scopeCommunityId: null },
  rawResponse: null,
} as const

function story(storyId: string, probability: number): PersistedClassifierDecisionResult {
  return { ...base, candidateKind: 'story', storyId, storedCandidateId: null, probability }
}

function item(rssFeedItemId: string, probability: number): PersistedClassifierDecisionResult {
  return {
    ...base,
    candidateKind: 'rss_feed_item',
    rssFeedItemId,
    storedCandidateId: null,
    probability,
  }
}

describe('selectStoryClusteringOutcome', () => {
  it('selects nothing when the classifier chose none, so no result row exists', () => {
    expect(selectStoryClusteringOutcome([])).toEqual({ kind: 'none' })
  })

  it('selects nothing below the lower threshold, however it ranks', () => {
    expect(selectStoryClusteringOutcome([story('a', 0.64), item('b', 0.1)])).toEqual({
      kind: 'none',
    })
  })

  it('joins an existing story at exactly the lower threshold', () => {
    expect(selectStoryClusteringOutcome([story('a', 0.65), item('b', 0.02)])).toEqual({
      kind: 'existing_story',
      storyId: 'a',
    })
  })

  it('pairs with a standalone item that clears the threshold', () => {
    expect(selectStoryClusteringOutcome([story('a', 0.02), item('b', 0.9)])).toEqual({
      kind: 'standalone',
      rssFeedItemId: 'b',
    })
  })

  it("judges each row by its own decision's threshold, never a later configuration", () => {
    const strict = { ...story('a', 0.7), effectiveThresholds: { lower: 0.8, upper: 0.95 } }
    expect(selectStoryClusteringOutcome([strict])).toEqual({ kind: 'none' })
  })

  it('ignores topic results, which can never join a story', () => {
    const topic: PersistedClassifierDecisionResult = {
      ...base,
      candidateKind: 'topic',
      topicId: 'topic',
      storedCandidateId: null,
      probability: 0.99,
    }
    expect(selectStoryClusteringOutcome([topic])).toEqual({ kind: 'none' })
  })

  it('is deterministic if more than one row clears: highest probability, then the smallest key', () => {
    expect(selectStoryClusteringOutcome([story('a', 0.7), item('b', 0.8)])).toEqual({
      kind: 'standalone',
      rssFeedItemId: 'b',
    })
    expect(selectStoryClusteringOutcome([story('b', 0.8), story('a', 0.8)])).toEqual({
      kind: 'existing_story',
      storyId: 'a',
    })
    expect(selectStoryClusteringOutcome([item('a', 0.8), story('z', 0.8)])).toEqual({
      kind: 'standalone',
      rssFeedItemId: 'a',
    })
  })
})
