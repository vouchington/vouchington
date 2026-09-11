import { describe, it, expect } from 'vitest'
import {
  createSlugFromTitle,
  validateSlug,
  isUsernameOrSlug,
  isUsername,
  validateUsername,
} from './slugs.mts'

describe('createSlugFromTitle', () => {
  it('should create slug from simple title', () => {
    expect(createSlugFromTitle('Hello World')).toBe('hello-world')
    expect(createSlugFromTitle('My Post Title')).toBe('my-post-title')
  })

  it('should handle special characters', () => {
    expect(createSlugFromTitle('Hello! World?')).toBe('hello-world')
    expect(createSlugFromTitle('Title @#$% Test')).toContain('title')
  })

  it('should handle accents and unicode', () => {
    expect(createSlugFromTitle('Café')).toBe('cafe')
    expect(createSlugFromTitle('Über')).toBe('uber')
  })

  it('should trim to max length at word boundary', () => {
    const title = 'Hello World Hello World'
    expect(createSlugFromTitle(title, 15)).toBe('hello-world')
    expect(createSlugFromTitle(title, 20)).toBe('hello-world-hello')
  })

  it('should use default max length of 50', () => {
    const longTitle =
      'a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-r-s-t-u-v-w-x-y-z-a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-r-s-t-u-v-w-x-y-z'
    const slug = createSlugFromTitle(longTitle)
    expect(slug.length).toBeLessThanOrEqual(50)
  })

  it('should handle multiple spaces and hyphens', () => {
    expect(createSlugFromTitle('Hello   World')).toBe('hello-world')
    expect(createSlugFromTitle('Hello---World')).toBe('hello-world')
  })

  it('should remove leading and trailing hyphens', () => {
    expect(createSlugFromTitle('-Hello World-')).toBe('hello-world')
    expect(createSlugFromTitle('---Test---')).toBe('test')
  })
})

describe('validateSlug', () => {
  it('should return valid slugs', () => {
    expect(validateSlug('hello-world')).toBe('hello-world')
    expect(validateSlug('test-123')).toBe('test-123')
  })

  it('should throw for invalid slugs', () => {
    expect(() => validateSlug('Hello-World')).toThrow(Error)
    expect(() => validateSlug('hello_world')).toThrow(Error)
    expect(() => validateSlug('')).toThrow(Error)
  })

  it('should throw with 422 status code', () => {
    expect(() => validateSlug('Invalid Slug')).toThrow(Error)
    let caughtError: any
    try {
      validateSlug('Invalid Slug')
    } catch (error: any) {
      caughtError = error
    }
    expect(caughtError?.status).toBe(422)
    expect(caughtError?.message).toContain('Slug must only contain lowercase')
  })
})

describe('isUsername', () => {
  it('should validate valid usernames', () => {
    expect(isUsername('john')).toBe(true)
    expect(isUsername('john_doe')).toBe(true)
    expect(isUsername('john-doe')).toBe(true)
    expect(isUsername('john123')).toBe(true)
    expect(isUsername('JOHN')).toBe(true)
  })

  it('should require at least 3 letters, start with a letter, end with alphanumeric', () => {
    expect(isUsername('ab')).toBe(false) // too few letters
    expect(isUsername('abc')).toBe(true) // 3 letters ok
    expect(isUsername('ab12')).toBe(false) // only 2 letters
    expect(isUsername('bl-viewer-3224865781')).toBe(true) // digit run but 8 letters
    expect(isUsername('1user')).toBe(false) // starts with digit, not a letter
    expect(isUsername('_john')).toBe(false) // starts with underscore
    expect(isUsername('john_')).toBe(false) // ends with underscore
  })

  it('should reject all-numeric usernames', () => {
    expect(isUsername('123')).toBe(false)
    expect(isUsername('12345')).toBe(false)
  })

  it('should reject special characters', () => {
    expect(isUsername('john@doe')).toBe(false)
    expect(isUsername('john.doe')).toBe(false)
    expect(isUsername('john doe')).toBe(false)
  })

  it('should allow letters, numbers, underscores, and hyphens', () => {
    expect(isUsername('user_123-test')).toBe(true)
    expect(isUsername('User_123-Test')).toBe(true)
  })

  it('should reject empty strings', () => {
    expect(isUsername('')).toBe(false)
  })
})

describe('validateUsername', () => {
  it('should return valid usernames', () => {
    expect(validateUsername('john')).toBe('john')
    expect(validateUsername('john_doe')).toBe('john_doe')
  })

  it('should require at least 3 characters', () => {
    expect(() => validateUsername('ab')).toThrow('at least 3 characters')
    expect(() => validateUsername('')).toThrow('at least 3 characters')
  })

  it('should limit to 50 characters', () => {
    const longUsername = 'a'.repeat(51)
    expect(() => validateUsername(longUsername)).toThrow('at most 50 characters')
  })

  it('should require starting with a letter', () => {
    expect(() => validateUsername('1user')).toThrow('must only contain letters')
    expect(() => validateUsername('_user')).toThrow('must only contain letters')
  })

  it('should require ending with letter or number', () => {
    expect(() => validateUsername('user_')).toThrow('must only contain letters')
    expect(() => validateUsername('user-')).toThrow('must only contain letters')
  })

  it('should allow letters, numbers, underscores, and hyphens in middle', () => {
    expect(validateUsername('user_123')).toBe('user_123')
    expect(validateUsername('user-test')).toBe('user-test')
  })

  it('should be case-insensitive', () => {
    expect(validateUsername('User')).toBe('User')
    expect(validateUsername('USER')).toBe('USER')
  })

  it('should throw with 422 status code', () => {
    expect(() => validateUsername('ab')).toThrow(Error)
    let caughtError: any
    try {
      validateUsername('ab')
    } catch (error: any) {
      caughtError = error
    }
    expect(caughtError?.status).toBe(422)
  })
})

describe('isUsernameOrSlug', () => {
  it('should accept valid usernames', () => {
    expect(isUsernameOrSlug('john')).toBe(true)
    expect(isUsernameOrSlug('john_doe')).toBe(true)
  })

  it('should accept valid slugs', () => {
    expect(isUsernameOrSlug('hello-world')).toBe(true)
    expect(isUsernameOrSlug('test-123')).toBe(true)
  })

  it('should reject invalid usernames and slugs', () => {
    expect(isUsernameOrSlug('ab')).toBe(true) // valid slug (2 chars is ok for slug)
    expect(isUsernameOrSlug('123')).toBe(true) // valid slug (all numbers is ok for slug)
    expect(isUsernameOrSlug('')).toBe(false)
    expect(isUsernameOrSlug('ab@')).toBe(false) // invalid characters
  })

  it('should handle edge cases', () => {
    expect(isUsernameOrSlug('abc')).toBe(true) // valid username and slug
    expect(isUsernameOrSlug('ABC')).toBe(true) // valid username but not slug
  })
})
