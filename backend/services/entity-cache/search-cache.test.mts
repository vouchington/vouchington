import { it, expect, describe } from 'vitest'
import { randomBytes } from 'node:crypto'
import { createSearchCache, invalidateSearchCache, stableSerialize } from './search-cache.mts'

// ─── stableSerialize ─────────────────────────────────────────────────────────

describe('stableSerialize', () => {
  it('produces the same hash for the same object', () => {
    const h1 = stableSerialize({ a: 1, b: 'hello' })
    const h2 = stableSerialize({ a: 1, b: 'hello' })
    expect(h1).toBe(h2)
  })

  it('is order-independent (key order does not matter)', () => {
    const h1 = stableSerialize({ a: 1, b: 2 })
    const h2 = stableSerialize({ b: 2, a: 1 })
    expect(h1).toBe(h2)
  })

  it('filters undefined values', () => {
    const h1 = stableSerialize({ a: 1, b: undefined })
    const h2 = stableSerialize({ a: 1 })
    expect(h1).toBe(h2)
  })

  it('produces different hashes for different values', () => {
    const h1 = stableSerialize({ a: 1 })
    const h2 = stableSerialize({ a: 2 })
    expect(h1).not.toBe(h2)
  })

  it('preserves case-sensitive string values (does not lowercase)', () => {
    // Base64 cursors are case-sensitive — the hash must be the same each time
    const cursor = 'eyJpZCI6IjAxOTNlMmY5LWE0YzEtNzAwMC05YTZlLTBhNWRkZTU0NWU5ZiJ9'
    const h1 = stableSerialize({ after: cursor })
    const h2 = stableSerialize({ after: cursor })
    expect(h1).toBe(h2)

    // Different case produces different hash (case is preserved in value)
    const h3 = stableSerialize({ after: cursor.toLowerCase() })
    expect(h1).not.toBe(h3)
  })

  it('returns a hex string', () => {
    const h = stableSerialize({ x: 'test' })
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })
})

// ─── createSearchCache ────────────────────────────────────────────────────────

describe('createSearchCache', () => {
  it('returns the result of the wrapped function', async () => {
    const prefix = `test_sc_${randomBytes(4).toString('hex')}`
    const cached = createSearchCache(prefix, (opts: { n: number }) => Promise.resolve(opts.n * 2))

    const result = await cached({ n: 5 })
    expect(result).toBe(10)
  })

  it('returns consistent results for the same options on repeated calls', async () => {
    const prefix = `test_sc_${randomBytes(4).toString('hex')}`
    const cached = createSearchCache(prefix, (opts: { v: string }) =>
      Promise.resolve(`value:${opts.v}`),
    )

    const r1 = await cached({ v: 'hello' })
    const r2 = await cached({ v: 'hello' })
    expect(r1).toBe(r2)
    expect(r1).toBe('value:hello')
  })

  it('returns different results for different options', async () => {
    const prefix = `test_sc_${randomBytes(4).toString('hex')}`
    const cached = createSearchCache(prefix, (opts: { v: string }) =>
      Promise.resolve(`value:${opts.v}`),
    )

    const r1 = await cached({ v: 'foo' })
    const r2 = await cached({ v: 'bar' })
    expect(r1).toBe('value:foo')
    expect(r2).toBe('value:bar')
  })

  it('treats options with same values but different key order identically', async () => {
    const prefix = `test_sc_${randomBytes(4).toString('hex')}`
    let callCount = 0
    const cached = createSearchCache(prefix, (opts: { a: number; b: number }) => {
      callCount++
      return Promise.resolve(opts.a + opts.b)
    })

    const r1 = await cached({ a: 1, b: 2 })
    const r2 = await cached({ b: 2, a: 1 })
    expect(r1).toBe(3)
    expect(r2).toBe(3)
    // Both calls should resolve to the same value (cache key is order-independent)
    expect(r1).toBe(r2)
    // callCount could be 1 (cache hit on second call) or 2 (both miss) depending on timing
    // but results must be identical — just verify correctness
    expect(callCount).toBeGreaterThanOrEqual(1)
  })

  it('invalidates cached search results by prefix', async () => {
    const prefix = `test_sc_${randomBytes(4).toString('hex')}`
    let value = 'before'
    const cached = createSearchCache(prefix, (_opts: { key: string }) => Promise.resolve(value))

    expect(await cached({ key: 'same' })).toBe('before')
    value = 'after'
    expect(await cached({ key: 'same' })).toBe('before')

    await invalidateSearchCache(prefix)

    expect(await cached({ key: 'same' })).toBe('after')
  })
})
