import { describe, expect, it } from 'vitest'
import { isUsername, validateUsername } from '@modules/utils'

describe('isUsername', () => {
  it('returns false for UUID-format strings', () => {
    expect(isUsername('123e4567-e89b-12d3-a456-426614174000')).toBe(false)
    expect(isUsername('550e8400-e29b-41d4-a716-446655440000')).toBe(false)
  })

  it('returns true for valid usernames', () => {
    expect(isUsername('alice')).toBe(true)
    expect(isUsername('test_user')).toBe(true)
    expect(isUsername('my-username')).toBe(true)
  })

  it('returns false for invalid usernames', () => {
    expect(isUsername('')).toBe(false)
    expect(isUsername('ab')).toBe(false) // too short
    expect(isUsername('12345')).toBe(false) // all numbers
  })

  it('returns true for digit-containing usernames that phone() would accept', () => {
    expect(isUsername('bl-viewer-3224865781')).toBe(true)
  })

  it('returns false for usernames with fewer than 3 letters', () => {
    expect(isUsername('ab12')).toBe(false) // only 2 letters
    expect(isUsername('a123')).toBe(false) // only 1 letter
  })

  it('returns false for usernames starting with a digit or non-letter', () => {
    expect(isUsername('1user')).toBe(false) // digit start
    expect(isUsername('_john')).toBe(false) // underscore start
  })

  it('returns false for usernames ending with underscore/hyphen', () => {
    expect(isUsername('john_')).toBe(false)
    expect(isUsername('john-')).toBe(false)
  })
})

describe('validateUsername', () => {
  it('throws 422 for UUID-format usernames', () => {
    expect(() => validateUsername('123e4567-e89b-12d3-a456-426614174000')).toThrow(Error)
    expect(() => validateUsername('550e8400-e29b-41d4-a716-446655440000')).toThrow(Error)
  })

  it('accepts valid usernames', () => {
    expect(validateUsername('alice')).toBe('alice')
    expect(validateUsername('test_user')).toBe('test_user')
    expect(validateUsername('my-handle')).toBe('my-handle')
  })

  it('throws for too-short usernames', () => {
    expect(() => validateUsername('ab')).toThrow(Error)
  })

  it('throws for too-long usernames', () => {
    expect(() => validateUsername('a'.repeat(51))).toThrow(Error)
  })
})
