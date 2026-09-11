import { describe, expect, it } from 'vitest'
import {
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  UUID_REGEX,
  isEmailAddress,
  isUUID,
  isUsernameUUID,
} from './validation.mts'

describe('validation constants', () => {
  it('exports username length constraints', () => {
    expect(USERNAME_MIN_LENGTH).toBe(3)
    expect(USERNAME_MAX_LENGTH).toBe(50)
  })

  it('exports a UUID_REGEX that matches canonical UUIDs', () => {
    expect(UUID_REGEX.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })
})

describe('isEmailAddress', () => {
  it('returns true for valid email addresses', () => {
    expect(isEmailAddress('tests+user@voucha.ai')).toBe(true)
    expect(isEmailAddress('first.last@sub.example.org')).toBe(true)
    expect(isEmailAddress('tests+user-tag@voucha.ai')).toBe(true)
  })

  it('returns false for empty string', () => {
    expect(isEmailAddress('')).toBe(false)
  })

  it('returns false for strings without @', () => {
    expect(isEmailAddress('notanemail')).toBe(false)
  })

  it('returns false for strings with spaces', () => {
    expect(isEmailAddress('tests+user @voucha.ai')).toBe(false)
    expect(isEmailAddress('tests+user@ voucha.ai')).toBe(false)
  })

  it('returns false for strings missing domain', () => {
    expect(isEmailAddress('user@')).toBe(false)
  })
})

describe('isUUID', () => {
  it('returns true for a valid UUID', () => {
    expect(isUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  it('returns true for an uppercase UUID', () => {
    expect(isUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true)
  })

  it('returns false for a non-UUID string', () => {
    expect(isUUID('not-a-uuid')).toBe(false)
  })

  it('returns false for an empty string', () => {
    expect(isUUID('')).toBe(false)
  })

  it('returns false for a UUID with extra characters', () => {
    expect(isUUID('550e8400-e29b-41d4-a716-446655440000-extra')).toBe(false)
  })
})

describe('isUsernameUUID', () => {
  it('returns true for a valid UUID', () => {
    expect(isUsernameUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  it('returns true for uppercase UUID', () => {
    expect(isUsernameUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true)
  })

  it('returns false for a regular username', () => {
    expect(isUsernameUUID('johndoe')).toBe(false)
  })

  it('returns false for an empty string', () => {
    expect(isUsernameUUID('')).toBe(false)
  })
})
