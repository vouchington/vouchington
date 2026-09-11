import { describe, expect, it } from 'vitest'
import { parseStaticCachedPaths } from '../cache-policy.mts'

describe('parseStaticCachedPaths', () => {
  it('includes machine-readable discovery paths in default hardcoded paths', () => {
    const paths = parseStaticCachedPaths(undefined)
    expect(paths.has('/llms.txt')).toBe(true)
    expect(paths.has('/llms-full.txt')).toBe(true)
    expect(paths.has('/.well-known/security.txt')).toBe(true)
    expect(paths.has('/.well-known/api-catalog')).toBe(true)
    expect(paths.has('/robots.txt')).toBe(true)
    expect(paths.has('/favicon.ico')).toBe(true)
  })
})
