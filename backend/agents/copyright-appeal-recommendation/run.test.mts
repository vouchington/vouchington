import { describe, expect, it } from 'vitest'
import { parseCopyrightAppealRecommendationOutput } from './run.mts'

describe('copyright appeal recommendation output', () => {
  it('accepts bounded advice without an action', () => {
    expect(
      parseCopyrightAppealRecommendationOutput(
        JSON.stringify({ recommendation: 'uncertain', rationale: 'A moderator should review.' }),
      ),
    ).toEqual({ recommendation: 'uncertain', rationale: 'A moderator should review.' })
  })

  it('rejects unsupported or unbounded model output', () => {
    expect(() =>
      parseCopyrightAppealRecommendationOutput(
        JSON.stringify({ recommendation: 'takedown', rationale: 'Take action.' }),
      ),
    ).toThrow('Invalid copyright appeal recommendation output')
    expect(() =>
      parseCopyrightAppealRecommendationOutput(
        JSON.stringify({ recommendation: 'uncertain', rationale: 'x'.repeat(10_001) }),
      ),
    ).toThrow('Invalid copyright appeal recommendation output')
  })
})
