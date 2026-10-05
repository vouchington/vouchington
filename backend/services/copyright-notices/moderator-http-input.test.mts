import { describe, expect, it } from 'vitest'
import {
  parseCopyrightSimilarityCandidateLimit,
  parseNullableCopyrightDate,
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

  it('parses nullable ISO dates', () => {
    expect(parseNullableCopyrightDate(null, 'commenced_at')).toBeNull()
    expect(parseNullableCopyrightDate('2026-07-01T12:00:00.000Z', 'commenced_at')).toEqual(
      new Date('2026-07-01T12:00:00.000Z'),
    )
    expect(() => parseNullableCopyrightDate(1, 'commenced_at')).toThrow(
      'commenced_at must be an ISO date or null',
    )
    expect(() => parseNullableCopyrightDate('not-a-date', 'commenced_at')).toThrow(
      'commenced_at must be an ISO date or null',
    )
  })

  it('parses nullable closed enums', () => {
    expect(parseNullableCopyrightEnum(null, ['federal_court', 'ccb'] as const, 'kind')).toBeNull()
    expect(parseNullableCopyrightEnum('ccb', ['federal_court', 'ccb'] as const, 'kind')).toBe('ccb')
    expect(() =>
      parseNullableCopyrightEnum('state_court', ['federal_court', 'ccb'] as const, 'kind'),
    ).toThrow('kind is invalid')
  })
})
