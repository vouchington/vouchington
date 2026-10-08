import { describe, expect, it } from 'vitest'
import { testCopyrightFormGuidance } from '@voucha/test-helpers/services/copyright-notices/form-guidance'
import { parseCopyrightFormScreeningOutput } from './output.mts'

const output = {
  recommendation: 'not_obviously_invalid',
  rationale: 'No obvious spam markers.',
  guidance: testCopyrightFormGuidance,
}

describe('copyright form screening output', () => {
  it('accepts the anti-spam recommendation with moderator guidance', () => {
    expect(parseCopyrightFormScreeningOutput(output)).toEqual(output)
  })

  it.each([
    ['a non-object', []],
    [
      'a recommendation outside the anti-spam vocabulary',
      { ...output, recommendation: 'takedown' },
    ],
    ['a non-string rationale', { ...output, rationale: 1 }],
    ['an oversized rationale', { ...output, rationale: 'x'.repeat(10_001) }],
    ['an extra top-level key', { ...output, restriction: 'withhold' }],
    ['missing guidance', { recommendation: output.recommendation, rationale: output.rationale }],
    ['malformed guidance', { ...output, guidance: { ...output.guidance, summary: '' } }],
  ])('rejects %s', (_label, value) => {
    expect(() => parseCopyrightFormScreeningOutput(value)).toThrow(
      'Invalid copyright form screening output',
    )
  })
})
