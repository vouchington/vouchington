import { describe, expect, it } from 'vitest'
import {
  classifierCandidateKindFamily,
  classifierResultEntityId,
  classifierResultKey,
} from './candidate-family.mts'
import type { ClassifierDecisionInputResult } from './types.mts'

describe('classifier candidate family', () => {
  it('stores a standalone RSS item in the story family, never a family of its own', () => {
    expect(classifierCandidateKindFamily('topic')).toBe('topic')
    expect(classifierCandidateKindFamily('story')).toBe('story')
    expect(classifierCandidateKindFamily('rss_feed_item')).toBe('story')
  })

  it('keys every result kind by its own entity, so a story and an item with equal ids never collide', () => {
    const shared = '018f0000-0000-7000-8000-000000000001'
    const base = { probability: 0.5, rawResponse: null }
    const results: ClassifierDecisionInputResult[] = [
      { ...base, candidateKind: 'story', storyId: shared, storedCandidateId: null },
      { ...base, candidateKind: 'rss_feed_item', rssFeedItemId: shared, storedCandidateId: null },
      { ...base, candidateKind: 'topic', topicId: shared, storedCandidateId: null },
    ]

    expect(results.map(classifierResultEntityId)).toEqual([shared, shared, shared])
    expect(new Set(results.map(classifierResultKey)).size).toBe(3)
    expect(classifierResultKey(results[1]!)).toBe(`rss_feed_item:${shared}`)
  })
})
