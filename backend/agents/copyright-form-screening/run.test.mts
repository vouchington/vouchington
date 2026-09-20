import { describe, expect, it } from 'vitest'
import { parseCopyrightFormScreeningOutput } from './run.mts'

describe('copyright form screening output', () => {
  it('accepts the anti-spam clear recommendation', () => {
    expect(
      parseCopyrightFormScreeningOutput(
        JSON.stringify({ recommendation: 'clear', rationale: 'No obvious spam markers.' }),
      ),
    ).toEqual({ recommendation: 'clear', rationale: 'No obvious spam markers.' })
  })

  it('rejects a recommendation outside the anti-spam vocabulary', () => {
    expect(() =>
      parseCopyrightFormScreeningOutput(
        JSON.stringify({ recommendation: 'takedown', rationale: 'Looks valid.' }),
      ),
    ).toThrow('Invalid copyright form screening output')
  })
})
