import { describe, expect, it } from 'vitest'
import { isHttpUrlWithoutFragment } from './valid-url'

describe('isHttpUrlWithoutFragment', () => {
  it('accepts http and https URLs with a host and no fragment', () => {
    expect(isHttpUrlWithoutFragment('https://example.com/path')).toBe(true)
    expect(isHttpUrlWithoutFragment('http://example.com')).toBe(true)
    expect(isHttpUrlWithoutFragment('  https://example.com/path  ')).toBe(true)
  })

  it('rejects URLs with a fragment', () => {
    expect(isHttpUrlWithoutFragment('https://example.com/#section')).toBe(false)
  })

  it('rejects non-http(s) protocols', () => {
    expect(isHttpUrlWithoutFragment('javascript:alert(1)')).toBe(false)
    expect(isHttpUrlWithoutFragment('mailto:a@b.com')).toBe(false)
  })

  it('rejects malformed or empty input', () => {
    expect(isHttpUrlWithoutFragment('not a url')).toBe(false)
    expect(isHttpUrlWithoutFragment('')).toBe(false)
    expect(isHttpUrlWithoutFragment('/relative')).toBe(false)
  })
})
