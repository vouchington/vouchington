import type { Context } from '@jongleberry/api-server'
import { describe, expect, it } from 'vitest'
import {
  parseCopyrightSimilarityCandidateLimit,
  parseNullableCopyrightDate,
  parseNullableCopyrightEnum,
} from './moderator-http-input.mts'

function ctx(): Context {
  return {
    assert(value: unknown, _status: number, message: string) {
      if (!value) throw Object.assign(new Error(message), { status: 422 })
    },
  } as Context
}

describe('copyright moderator HTTP parsers', () => {
  it('accepts an in-range similarity candidate limit and ignores invalid values', () => {
    expect(parseCopyrightSimilarityCandidateLimit(undefined)).toBeUndefined()
    expect(parseCopyrightSimilarityCandidateLimit('10')).toBe(10)
    expect(parseCopyrightSimilarityCandidateLimit('0')).toBeUndefined()
    expect(parseCopyrightSimilarityCandidateLimit('51')).toBeUndefined()
    expect(parseCopyrightSimilarityCandidateLimit(10)).toBeUndefined()
  })

  it('parses nullable ISO dates', () => {
    expect(parseNullableCopyrightDate(ctx(), null, 'commenced_at')).toBeNull()
    expect(parseNullableCopyrightDate(ctx(), '2026-07-01T12:00:00.000Z', 'commenced_at')).toEqual(
      new Date('2026-07-01T12:00:00.000Z'),
    )
    expect(() => parseNullableCopyrightDate(ctx(), 1, 'commenced_at')).toThrow(
      'commenced_at must be an ISO date or null',
    )
    expect(() => parseNullableCopyrightDate(ctx(), 'not-a-date', 'commenced_at')).toThrow(
      'commenced_at must be an ISO date or null',
    )
  })

  it('parses nullable closed enums', () => {
    expect(
      parseNullableCopyrightEnum(ctx(), null, ['federal_court', 'ccb'] as const, 'kind'),
    ).toBeNull()
    expect(
      parseNullableCopyrightEnum(ctx(), 'ccb', ['federal_court', 'ccb'] as const, 'kind'),
    ).toBe('ccb')
    expect(() =>
      parseNullableCopyrightEnum(ctx(), 'state_court', ['federal_court', 'ccb'] as const, 'kind'),
    ).toThrow('kind is invalid')
  })
})
