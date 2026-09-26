import { describe, expect, it } from 'vitest'
import type { StoryClusterCandidateRow } from '@voucha/types/entities/story'
import { dedupeStoryClusterCandidates } from './dedupe-candidates.mts'

function candidate(
  id: string,
  story_id: string | null,
  distance: number,
): StoryClusterCandidateRow {
  return { id, story_id, story_published_at: null, distance }
}

describe('dedupeStoryClusterCandidates', () => {
  it('keeps every standalone candidate (story_id: null) without deduping them together', () => {
    const candidates = [candidate('item-1', null, 0.1), candidate('item-2', null, 0.2)]
    expect(dedupeStoryClusterCandidates(candidates)).toEqual(candidates)
  })

  it('collapses multiple candidates for the same story down to the nearest one', () => {
    const nearest = candidate('item-1', 'story-1', 0.1)
    const farther = candidate('item-2', 'story-1', 0.3)
    expect(dedupeStoryClusterCandidates([nearest, farther])).toEqual([nearest])
  })

  it('keeps candidates for distinct stories separate', () => {
    const candidates = [candidate('item-1', 'story-1', 0.1), candidate('item-2', 'story-2', 0.2)]
    expect(dedupeStoryClusterCandidates(candidates)).toEqual(candidates)
  })

  it('preserves input (distance-ascending) order in the deduped output', () => {
    const candidates = [
      candidate('item-1', 'story-1', 0.1),
      candidate('item-2', null, 0.15),
      candidate('item-3', 'story-1', 0.2),
      candidate('item-4', 'story-2', 0.25),
    ]
    expect(dedupeStoryClusterCandidates(candidates)).toEqual([
      candidates[0],
      candidates[1],
      candidates[3],
    ])
  })

  it('returns an empty list for an empty input', () => {
    expect(dedupeStoryClusterCandidates([])).toEqual([])
  })
})
