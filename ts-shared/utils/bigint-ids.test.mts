import { describe, expect, it } from 'vitest'
import { parsePositiveBigintId, parsePositiveBigintIdParam } from './bigint-ids.mts'

describe('parsePositiveBigintId', () => {
  it('accepts positive safe integer numbers and PostgreSQL BIGINT strings', () => {
    expect(parsePositiveBigintId(1)).toBe('1')
    expect(parsePositiveBigintId('9223372036854775807')).toBe('9223372036854775807')
  })

  it('rejects values outside positive PostgreSQL BIGINT id range', () => {
    expect(parsePositiveBigintId(0)).toBeNull()
    expect(parsePositiveBigintId(Number.MAX_SAFE_INTEGER + 1)).toBeNull()
    expect(parsePositiveBigintId('9223372036854775808')).toBeNull()
    expect(parsePositiveBigintId('001')).toBeNull()
    expect(parsePositiveBigintId('not-an-id')).toBeNull()
  })

  it('rejects non-string non-number inputs', () => {
    expect(parsePositiveBigintId(null)).toBeNull()
    expect(parsePositiveBigintId(undefined)).toBeNull()
    expect(parsePositiveBigintId({})).toBeNull()
    expect(parsePositiveBigintId([])).toBeNull()
    expect(parsePositiveBigintId(true)).toBeNull()
  })

  it('rejects non-integer numbers', () => {
    expect(parsePositiveBigintId(1.5)).toBeNull()
    expect(parsePositiveBigintId(Number.NaN)).toBeNull()
    expect(parsePositiveBigintId(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('parsePositiveBigintIdParam', () => {
  it('returns undefined for missing or invalid query params', () => {
    expect(parsePositiveBigintIdParam({}, 'id')).toBeUndefined()
    expect(parsePositiveBigintIdParam({ id: '9223372036854775808' }, 'id')).toBeUndefined()
  })

  it('returns the normalized id string for valid query params', () => {
    expect(parsePositiveBigintIdParam({ id: 42 }, 'id')).toBe('42')
    expect(parsePositiveBigintIdParam({ id: '9223372036854775807' }, 'id')).toBe(
      '9223372036854775807',
    )
  })
})
