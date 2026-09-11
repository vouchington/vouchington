import { it, expect, describe } from 'vitest'
import { getCacheKeys } from '../keys.mts'
import { v7 } from 'uuid'

describe('keys.generated (getCacheKeys)', () => {
  it('getCacheKeys returns empty sets for empty input', () => {
    const result = getCacheKeys([])
    expect(result.ids.size).toBe(0)
    expect(result.slugs.size).toBe(0)
  })

  it('getCacheKeys extracts UUIDs from string array', () => {
    const uuid1 = v7()
    const uuid2 = v7()
    const result = getCacheKeys([uuid1, uuid2])
    expect(result.ids.size).toBe(2)
    expect(result.ids.has(uuid1.toLowerCase())).toBe(true)
    expect(result.ids.has(uuid2.toLowerCase())).toBe(true)
    // UUIDs are excluded from slugs (even though they match isSlug pattern)
    expect(result.slugs.size).toBe(0)
  })

  it('getCacheKeys extracts slugs from string array', () => {
    const result = getCacheKeys(['test-slug', 'another-slug'])
    expect(result.slugs.size).toBe(2)
    expect(result.slugs.has('test-slug')).toBe(true)
    expect(result.slugs.has('another-slug')).toBe(true)
    expect(result.ids.size).toBe(0)
  })

  it('getCacheKeys extracts usernames from string array', () => {
    const result = getCacheKeys(['testuser', 'anotheruser'])
    expect(result.slugs.size).toBe(2)
    expect(result.slugs.has('testuser')).toBe(true)
    expect(result.slugs.has('anotheruser')).toBe(true)
    expect(result.ids.size).toBe(0)
  })

  it('getCacheKeys extracts id from object', () => {
    const uuid = v7()
    const result = getCacheKeys([{ id: uuid }])
    expect(result.ids.size).toBe(1)
    expect(result.ids.has(uuid.toLowerCase())).toBe(true)
    // UUIDs are excluded from slugs
    expect(result.slugs.size).toBe(0)
  })

  it('getCacheKeys extracts slug from object', () => {
    const result = getCacheKeys([{ slug: 'test-slug' }])
    expect(result.slugs.size).toBe(1)
    expect(result.slugs.has('test-slug')).toBe(true)
    expect(result.ids.size).toBe(0)
  })

  it('getCacheKeys extracts username from object', () => {
    const result = getCacheKeys([{ username: 'testuser' }])
    expect(result.slugs.size).toBe(1)
    expect(result.slugs.has('testuser')).toBe(true)
    expect(result.ids.size).toBe(0)
  })

  it('getCacheKeys extracts all properties from object', () => {
    const uuid = v7()
    const result = getCacheKeys([{ id: uuid, slug: 'test-slug', username: 'testuser' }])
    expect(result.ids.size).toBe(1)
    expect(result.ids.has(uuid.toLowerCase())).toBe(true)
    // UUID from id field is excluded from slugs; only slug and username appear
    expect(result.slugs.size).toBe(2)
    expect(result.slugs.has('test-slug')).toBe(true)
    expect(result.slugs.has('testuser')).toBe(true)
  })

  it('getCacheKeys handles nested arrays', () => {
    const uuid = v7()
    const result = getCacheKeys([[uuid, 'test-slug'], ['another-slug']])
    expect(result.ids.size).toBe(1)
    expect(result.ids.has(uuid.toLowerCase())).toBe(true)
    // UUID excluded from slugs; only non-UUID strings appear
    expect(result.slugs.size).toBe(2)
    expect(result.slugs.has('test-slug')).toBe(true)
    expect(result.slugs.has('another-slug')).toBe(true)
  })

  it('getCacheKeys filters out falsy values', () => {
    const uuid = v7()
    const result = getCacheKeys([uuid, null, undefined, '', false, 0, 'test-slug'])
    expect(result.ids.size).toBe(1)
    expect(result.ids.has(uuid.toLowerCase())).toBe(true)
    // UUID excluded from slugs
    expect(result.slugs.size).toBe(1)
    expect(result.slugs.has('test-slug')).toBe(true)
  })

  it('getCacheKeys converts strings to lowercase', () => {
    const uuid = v7().toUpperCase()
    const result = getCacheKeys([uuid, 'Test-Slug', 'TestUser'])
    expect(result.ids.size).toBe(1)
    expect(result.ids.has(uuid.toLowerCase())).toBe(true)
    // UUID excluded from slugs; slug and username appear (lowercased)
    expect(result.slugs.size).toBe(2)
    expect(result.slugs.has('test-slug')).toBe(true)
    expect(result.slugs.has('testuser')).toBe(true)
  })

  it('getCacheKeys throws error for invalid key type', () => {
    expect(() => getCacheKeys([123])).toThrow('Invalid key: 123')
    expect(() => getCacheKeys([true])).toThrow('Invalid key: true')
  })

  it('getCacheKeys handles mixed object and string inputs', () => {
    const uuid1 = v7()
    const uuid2 = v7()
    const result = getCacheKeys([uuid1, { id: uuid2, slug: 'test-slug' }, 'another-slug'])
    expect(result.ids.size).toBe(2)
    expect(result.ids.has(uuid1.toLowerCase())).toBe(true)
    expect(result.ids.has(uuid2.toLowerCase())).toBe(true)
    // UUIDs excluded from slugs; only non-UUID slug/username strings appear
    expect(result.slugs.size).toBe(2)
    expect(result.slugs.has('test-slug')).toBe(true)
    expect(result.slugs.has('another-slug')).toBe(true)
  })
})
