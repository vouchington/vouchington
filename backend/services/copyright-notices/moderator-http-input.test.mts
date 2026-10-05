import { describe, expect, it } from 'vitest'
import {
  parseCopyrightSimilarityCandidateLimit,
  parseNullableCopyrightEnum,
} from './moderator-http-input.mts'

describe('copyright moderator HTTP parsers', () => {
  it('accepts an in-range similarity candidate limit and ignores invalid values', () => {
    expect(parseCopyrightSimilarityCandidateLimit(undefined)).toBeUndefined()
    expect(parseCopyrightSimilarityCandidateLimit('10')).toBe(10)
    expect(parseCopyrightSimilarityCandidateLimit('0')).toBeUndefined()
    expect(parseCopyrightSimilarityCandidateLimit('51')).toBeUndefined()
    expect(parseCopyrightSimilarityCandidateLimit(10)).toBeUndefined()
  })

  it('parses nullable closed enums', () => {
    expect(parseNullableCopyrightEnum(null, ['federal_court', 'ccb'] as const, 'kind')).toBeNull()
    expect(parseNullableCopyrightEnum('ccb', ['federal_court', 'ccb'] as const, 'kind')).toBe('ccb')
    expect(() =>
      parseNullableCopyrightEnum('state_court', ['federal_court', 'ccb'] as const, 'kind'),
    ).toThrow('kind is invalid')
  })
})
