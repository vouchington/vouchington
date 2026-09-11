import { describe, expect, it, vi } from 'vitest'
import { ContentAndIdentityCache } from './key-set-identity-cache.mts'

describe('ContentAndIdentityCache', () => {
  it('computes once and returns the same value for repeated calls with the same identity key', () => {
    const cache = new ContentAndIdentityCache<object, string, number>()
    const compute = vi.fn<() => number>(() => 1)
    const key = {}

    expect(cache.getOrCompute(key, 'mode', () => 'content', compute)).toBe(1)
    expect(cache.getOrCompute(key, 'mode', () => 'content', compute)).toBe(1)

    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('skips deriving the content key on an identity-cache hit', () => {
    const cache = new ContentAndIdentityCache<object, string, number>()
    const getContentKey = vi.fn<() => string>(() => 'content')
    const key = {}

    cache.getOrCompute(key, 'mode', getContentKey, () => 1)
    cache.getOrCompute(key, 'mode', getContentKey, () => 1)

    expect(getContentKey).toHaveBeenCalledTimes(1)
  })

  it('keeps sub-keys independent for the same identity key', () => {
    const cache = new ContentAndIdentityCache<object, string, number>()
    const key = {}

    expect(
      cache.getOrCompute(
        key,
        'a',
        () => 'content-a',
        () => 1,
      ),
    ).toBe(1)
    expect(
      cache.getOrCompute(
        key,
        'b',
        () => 'content-b',
        () => 2,
      ),
    ).toBe(2)
    expect(
      cache.getOrCompute(
        key,
        'a',
        () => 'content-a',
        () => 3,
      ),
    ).toBe(1)
  })

  it('shares the content cache across distinct identity keys with the same content key', () => {
    const cache = new ContentAndIdentityCache<object, string, number>()
    const compute = vi.fn<() => number>(() => 1)

    expect(cache.getOrCompute({}, 'mode', () => 'same-content', compute)).toBe(1)
    expect(cache.getOrCompute({}, 'mode', () => 'same-content', compute)).toBe(1)

    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('still computes and caches by content key when no identity key is given', () => {
    const cache = new ContentAndIdentityCache<object, string, number>()
    const compute = vi.fn<() => number>(() => 1)

    expect(cache.getOrCompute(undefined, 'mode', () => 'content', compute)).toBe(1)
    expect(cache.getOrCompute(undefined, 'mode', () => 'content', compute)).toBe(1)

    expect(compute).toHaveBeenCalledTimes(1)
  })
})
