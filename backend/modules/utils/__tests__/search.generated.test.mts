import { describe, it, expect } from 'vitest'

import { getIDsFromQuery, getTypesFromQuery, getSecondsToDate, getIdFromQuery } from '../search.mts'

const validUUID = '123e4567-e89b-12d3-a456-426614174000'

const validUUID2 = '987fcdeb-51a2-43d1-b789-0123456789ab'

describe('getIDsFromQuery', () => {
  it('should parse single UUID string', () => {
    expect(getIDsFromQuery(validUUID)).toEqual([validUUID])
  })

  it('should parse comma-separated UUIDs', () => {
    expect(getIDsFromQuery(`${validUUID},${validUUID2}`)).toEqual([validUUID, validUUID2])
  })

  it('should parse semicolon-separated UUIDs', () => {
    expect(getIDsFromQuery(`${validUUID};${validUUID2}`)).toEqual([validUUID, validUUID2])
  })

  it('should parse pipe-separated UUIDs', () => {
    expect(getIDsFromQuery(`${validUUID}|${validUUID2}`)).toEqual([validUUID, validUUID2])
  })

  it('should parse array of UUIDs', () => {
    expect(getIDsFromQuery([validUUID, validUUID2])).toEqual([validUUID, validUUID2])
  })

  it('should trim whitespace', () => {
    expect(getIDsFromQuery(`  ${validUUID}  ,  ${validUUID2}  `)).toEqual([validUUID, validUUID2])
  })

  it('should filter out empty strings', () => {
    expect(getIDsFromQuery(`${validUUID},,${validUUID2}`)).toEqual([validUUID, validUUID2])
  })

  it('should return empty array for empty input', () => {
    expect(getIDsFromQuery('')).toEqual([])
    expect(getIDsFromQuery([])).toEqual([])
  })

  it('should throw for invalid UUIDs', () => {
    expect(() => getIDsFromQuery('not-a-uuid')).toThrow('Invalid UUIDs')
    expect(() => getIDsFromQuery([validUUID, 'invalid'])).toThrow('Invalid UUIDs')
  })

  it('reports invalid UUIDs with the API error contract', () => {
    expect(() => getIDsFromQuery('invalid')).toThrow(
      expect.objectContaining({ message: 'Invalid UUIDs', status: 422 }),
    )
  })
})

describe('getTypesFromQuery', () => {
  const typesMap = { post: true, comment: true, user: true }

  it('should parse single type string', () => {
    expect(getTypesFromQuery('post', typesMap)).toEqual(['post'])
  })

  it('should parse comma-separated types', () => {
    expect(getTypesFromQuery('post,comment', typesMap)).toEqual(['post', 'comment'])
  })

  it('should parse semicolon-separated types', () => {
    expect(getTypesFromQuery('post;comment', typesMap)).toEqual(['post', 'comment'])
  })

  it('should parse array of types', () => {
    expect(getTypesFromQuery(['post', 'comment'], typesMap)).toEqual(['post', 'comment'])
  })

  it('should trim whitespace', () => {
    expect(getTypesFromQuery('  post  ,  comment  ', typesMap)).toEqual(['post', 'comment'])
  })

  it('should filter out empty strings', () => {
    expect(getTypesFromQuery('post,,comment', typesMap)).toEqual(['post', 'comment'])
  })

  it('should return empty array for empty input', () => {
    expect(getTypesFromQuery('', typesMap)).toEqual([])
    expect(getTypesFromQuery([], typesMap)).toEqual([])
  })

  it('should throw for invalid types', () => {
    expect(() => getTypesFromQuery('invalid', typesMap)).toThrow('Invalid types')
    expect(() => getTypesFromQuery(['post', 'invalid'], typesMap)).toThrow('Invalid types')
  })

  it('reports invalid types with the API error contract', () => {
    expect(() => getTypesFromQuery('invalid', typesMap)).toThrow(
      expect.objectContaining({ message: 'Invalid types', status: 422 }),
    )
  })
})

describe('getSecondsToDate', () => {
  const now = Date.now()
  const pastSeconds = Math.floor(now / 1000) - 3600 // 1 hour ago

  it('should return Date object as-is', () => {
    const date = new Date()
    expect(getSecondsToDate(date)).toBe(date)
  })

  it('should convert seconds to Date', () => {
    const result = getSecondsToDate(pastSeconds)
    expect(result.getTime()).toBe(pastSeconds * 1000)
  })

  it('should throw for NaN', () => {
    expect(() => getSecondsToDate(Number.NaN)).toThrow('Invalid seconds')
  })

  it('should throw for future dates', () => {
    const futureSeconds = Math.floor(now / 1000) + 3600
    expect(() => getSecondsToDate(futureSeconds)).toThrow('Future dates are not allowed')
  })

  it('should throw for invalid dates (0 or negative)', () => {
    expect(() => getSecondsToDate(0)).toThrow('Invalid date')
    expect(() => getSecondsToDate(-1)).toThrow('Invalid date')
  })

  it('reports invalid seconds with the API error contract', () => {
    expect(() => getSecondsToDate(Number.NaN)).toThrow(
      expect.objectContaining({ message: 'Invalid seconds', status: 422 }),
    )
  })
})

describe('getIdFromQuery', () => {
  it('should return valid UUID', () => {
    expect(getIdFromQuery(validUUID)).toBe(validUUID)
  })

  it('should throw for invalid UUID', () => {
    expect(() => getIdFromQuery('not-a-uuid')).toThrow('Invalid ID')
  })

  it('reports invalid IDs with the API error contract', () => {
    expect(() => getIdFromQuery('invalid')).toThrow(
      expect.objectContaining({ message: 'Invalid ID', status: 422 }),
    )
  })
})
