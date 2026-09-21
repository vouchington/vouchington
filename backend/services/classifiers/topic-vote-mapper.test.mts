import { describe, expect, it } from 'vitest'
import { mapClassifierProbabilityToTopicVoteScore } from './topic-vote-mapper.mts'

describe('mapClassifierProbabilityToTopicVoteScore', () => {
  it('maps strict outer bounds and inclusive neutral boundaries', () => {
    const thresholds = { lower: 0.25, upper: 0.75 }
    expect([
      mapClassifierProbabilityToTopicVoteScore(0.24, thresholds),
      mapClassifierProbabilityToTopicVoteScore(0.25, thresholds),
      mapClassifierProbabilityToTopicVoteScore(0.5, thresholds),
      mapClassifierProbabilityToTopicVoteScore(0.75, thresholds),
      mapClassifierProbabilityToTopicVoteScore(0.76, thresholds),
    ]).toEqual([-1, 0, 0, 0, 1])
  })

  it('rejects invalid probabilities and thresholds', () => {
    expect(() =>
      mapClassifierProbabilityToTopicVoteScore(Number.NaN, { lower: 0.25, upper: 0.75 }),
    ).toThrow('Classifier probability')
    expect(() =>
      mapClassifierProbabilityToTopicVoteScore(0.5, { lower: 0.75, upper: 0.75 }),
    ).toThrow('Classifier effective thresholds')
  })
})
