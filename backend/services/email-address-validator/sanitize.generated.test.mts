import { it, expect, describe } from 'vitest'
import { sanitizeEmailAddress } from './sanitize.mts'

const localEnv = { ENVIRONMENT: 'development' }
const testEnv = { ENVIRONMENT: 'test', NODE_ENV: 'production' }
const productionEnv = { ENVIRONMENT: 'production' }
const stagingEnv = { ENVIRONMENT: 'staging' }

describe('sanitize.generated', () => {
  it('sanitizeEmailAddress trims whitespace', () => {
    expect(sanitizeEmailAddress('  tests+user@voucha.ai  ', localEnv)).toBe('tests+user@voucha.ai')
    expect(sanitizeEmailAddress('\ttests+user@voucha.ai\n', localEnv)).toBe('tests+user@voucha.ai')
  })

  it('sanitizeEmailAddress converts to lowercase', () => {
    expect(sanitizeEmailAddress('tests+USER@voucha.ai', localEnv)).toBe('tests+user@voucha.ai')
    expect(sanitizeEmailAddress('tests+User@voucha.ai', localEnv)).toBe('tests+user@voucha.ai')
    expect(sanitizeEmailAddress('tests+UsEr@voucha.ai', localEnv)).toBe('tests+user@voucha.ai')
  })

  it('sanitizeEmailAddress trims and lowercases together', () => {
    expect(sanitizeEmailAddress('  tests+USER@voucha.ai  ', localEnv)).toBe('tests+user@voucha.ai')
    expect(sanitizeEmailAddress('  tests+User@voucha.ai  ', localEnv)).toBe('tests+user@voucha.ai')
  })

  it('sanitizeEmailAddress preserves email structure', () => {
    expect(sanitizeEmailAddress('tests+user@voucha.ai', localEnv)).toBe('tests+user@voucha.ai')
    expect(sanitizeEmailAddress('first.last@sub.example.com', localEnv)).toBe(
      'first.last@sub.example.com',
    )
    expect(sanitizeEmailAddress('user_name@example-site.org', localEnv)).toBe(
      'user_name@example-site.org',
    )
  })

  it('sanitizeEmailAddress in a non-deployed environment keeps plus sign', () => {
    expect(sanitizeEmailAddress('tests+user-test@voucha.ai', localEnv)).toBe(
      'tests+user-test@voucha.ai',
    )
    expect(sanitizeEmailAddress('tests+user-tag123@voucha.ai', localEnv)).toBe(
      'tests+user-tag123@voucha.ai',
    )
    expect(sanitizeEmailAddress('tests+User-Test@voucha.ai', localEnv)).toBe(
      'tests+user-test@voucha.ai',
    )
  })

  it('sanitizeEmailAddress prefers ENVIRONMENT over NODE_ENV for plus-sign stripping', () => {
    expect(sanitizeEmailAddress('tests+user-test@voucha.ai', testEnv)).toBe(
      'tests+user-test@voucha.ai',
    )
  })

  it('sanitizeEmailAddress in a deployed environment removes plus sign', () => {
    expect(sanitizeEmailAddress('tests+user-test@voucha.ai', productionEnv)).toBe('tests@voucha.ai')
    expect(sanitizeEmailAddress('tests+user-tag123@voucha.ai', productionEnv)).toBe(
      'tests@voucha.ai',
    )
    expect(sanitizeEmailAddress('tests+User-Test@voucha.ai', productionEnv)).toBe('tests@voucha.ai')
    expect(sanitizeEmailAddress('tests+user-test@voucha.ai', stagingEnv)).toBe('tests@voucha.ai')
  })

  it('sanitizeEmailAddress in a deployed environment handles plus at start of local part', () => {
    // If plus is at position 0, local part would be empty, keep original behavior
    expect(sanitizeEmailAddress('+tests@voucha.ai', productionEnv)).toBe('+tests@voucha.ai')
  })

  it('sanitizeEmailAddress in a deployed environment handles multiple plus signs', () => {
    // Only removes from first plus onwards
    expect(sanitizeEmailAddress('tests+user+tag@voucha.ai', productionEnv)).toBe('tests@voucha.ai')
  })

  it('sanitizeEmailAddress in a deployed environment handles email without plus', () => {
    expect(sanitizeEmailAddress('tests@voucha.ai', productionEnv)).toBe('tests@voucha.ai')
    expect(sanitizeEmailAddress('tests-user@voucha.ai', productionEnv)).toBe('tests-user@voucha.ai')
  })

  it('sanitizeEmailAddress in a deployed environment handles email without @ symbol', () => {
    // Invalid email format, but sanitizer doesn't validate, just sanitizes
    expect(sanitizeEmailAddress('notanemail', productionEnv)).toBe('notanemail')
  })
})
