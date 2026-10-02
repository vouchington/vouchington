import { describe, expect, it } from 'vitest'
import { isCommunityPromptFlagged } from './community-prompt-flagged.mts'

const thresholds = { lower: 0.2, upper: 0.8 }

describe('isCommunityPromptFlagged', () => {
  it.each([
    { probability: 1, flagged: true },
    { probability: 0.81, flagged: true },
    { probability: 0.8, flagged: false },
    { probability: 0.5, flagged: false },
    { probability: 0.2, flagged: false },
    { probability: 0, flagged: false },
  ])('is $flagged at probability $probability', ({ probability, flagged }) => {
    expect(isCommunityPromptFlagged(probability, thresholds)).toBe(flagged)
  })

  it('rejects thresholds that are not strictly ordered rather than judging by them', () => {
    expect(() => isCommunityPromptFlagged(0.9, { lower: 0.8, upper: 0.2 })).toThrow(
      'Classifier effective thresholds must be finite and strictly ordered in zero to one',
    )
  })
})
