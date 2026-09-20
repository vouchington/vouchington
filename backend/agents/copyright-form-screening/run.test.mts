import { describe, expect, it } from 'vitest'
import { parseCopyrightFormScreeningOutput } from './run.mts'

describe('copyright form screening output', () => {
  it('accepts the not-obviously-invalid anti-spam recommendation', () => {
    expect(
      parseCopyrightFormScreeningOutput(
        JSON.stringify({
          recommendation: 'not_obviously_invalid',
          rationale: 'No obvious spam markers.',
        }),
      ),
    ).toEqual({
      recommendation: 'not_obviously_invalid',
      rationale: 'No obvious spam markers.',
    })
  })

  it('rejects a recommendation outside the anti-spam vocabulary', () => {
    expect(() =>
      parseCopyrightFormScreeningOutput(
        JSON.stringify({ recommendation: 'takedown', rationale: 'Looks valid.' }),
      ),
    ).toThrow('Invalid copyright form screening output')
  })
})
