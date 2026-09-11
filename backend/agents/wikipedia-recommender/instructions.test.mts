import { describe, expect, it } from 'vitest'
import { WIKIPEDIA_RECOMMENDER_INSTRUCTIONS } from './instructions.mts'

describe('WIKIPEDIA_RECOMMENDER_INSTRUCTIONS', () => {
  it('keeps the recommendation contract bounded and Wikipedia-backed', () => {
    expect(WIKIPEDIA_RECOMMENDER_INSTRUCTIONS).toContain('Wikipedia references')
    expect(WIKIPEDIA_RECOMMENDER_INSTRUCTIONS).toContain('Maximum 5 recommendations')
    expect(WIKIPEDIA_RECOMMENDER_INSTRUCTIONS).toContain('confidence score')
  })
})
