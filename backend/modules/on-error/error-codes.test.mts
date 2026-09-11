import { describe, expect, it } from 'vitest'
import * as errorCodes from './error-codes.mts'

describe('error-codes', () => {
  it('all exported values are non-empty strings', () => {
    const failures: string[] = []
    for (const [key, value] of Object.entries(errorCodes)) {
      if (typeof value !== 'string') failures.push(`${key} is not a string`)
      else if (value.length === 0) failures.push(`${key} is empty`)
    }
    expect(failures).toEqual([])
  })

  it('no duplicate values among exports', () => {
    const values = Object.values(errorCodes)
    const unique = new Set(values)
    expect(unique.size).toBe(values.length)
  })

  it('specific values match expectations (regression guard)', () => {
    expect(errorCodes.AUTH_REQUIRED).toBe('AUTH_REQUIRED')
    expect(errorCodes.FORBIDDEN).toBe('FORBIDDEN')
    expect(errorCodes.INVALID_INPUT).toBe('INVALID_INPUT')
    expect(errorCodes.INVALID_CONTENT_TYPE).toBe('INVALID_CONTENT_TYPE')
    expect(errorCodes.NOT_FOUND).toBe('NOT_FOUND')
    expect(errorCodes.CONFLICT).toBe('CONFLICT')
    expect(errorCodes.RATE_LIMIT).toBe('RATE_LIMIT')
    expect(errorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR')
    expect(errorCodes.BAD_GATEWAY).toBe('BAD_GATEWAY')
    expect(errorCodes.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE')
    expect(errorCodes.USER_CREATION_RACE).toBe('USER_CREATION_RACE')
  })
})
