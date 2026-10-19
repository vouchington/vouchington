import { describe, expect, it } from 'vitest'
import { computeParentPath, extractDomain, isHostname } from './urls.mts'

describe('isHostname', () => {
  it('validates lowercase hostnames and IP-like values', () => {
    expect(isHostname('example.com')).toBe(true)
    expect(isHostname('sub.example.com')).toBe(true)
    expect(isHostname('api-v2.example.co.uk')).toBe(true)
    expect(isHostname('192.168.1.1')).toBe(true)
  })

  it('rejects invalid hostnames', () => {
    expect(isHostname('')).toBe(false)
    expect(isHostname('EXAMPLE.COM')).toBe(false)
    expect(isHostname('example_.com')).toBe(false)
    expect(isHostname('example com')).toBe(false)
  })
})

describe('extractDomain', () => {
  it('extracts domains from valid URLs', () => {
    expect(extractDomain('https://example.com/path')).toBe('example.com')
    expect(extractDomain('https://sub.example.com/path')).toBe('sub.example.com')
    expect(extractDomain('http://example.com:8080/path')).toBe('example.com')
  })

  it('returns unknown for invalid URLs', () => {
    expect(extractDomain('not a url')).toBe('unknown')
    expect(extractDomain('')).toBe('unknown')
  })
})

describe('computeParentPath', () => {
  it('returns null for root path', () => {
    expect(computeParentPath('/')).toBe(null)
  })

  it('returns / for a single-level path', () => {
    expect(computeParentPath('/about')).toBe('/')
  })

  it('returns the first-level directory for nested paths', () => {
    expect(computeParentPath('/blog/2024/my-post')).toBe('/blog')
    expect(computeParentPath('/blog/post')).toBe('/blog')
    expect(computeParentPath('/a/b/c/d')).toBe('/a')
  })
})
