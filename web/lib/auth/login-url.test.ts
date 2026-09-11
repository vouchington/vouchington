import { describe, expect, it } from 'vitest'
import { buildLoginHref, sanitizeLoginNext } from './login-url'

describe('login-url', () => {
  it('builds intent-aware login URLs with a safe next path', () => {
    expect(buildLoginHref({ next: '/news?topics=t1', intent: 'vote' })).toBe(
      '/login?next=%2Fnews%3Ftopics%3Dt1&intent=vote',
    )
  })

  it('keeps explicit homepage return targets distinct from direct login visits', () => {
    expect(buildLoginHref({ next: '/', intent: 'vote' })).toBe('/login?next=%2F&intent=vote')
    expect(buildLoginHref({ intent: 'vote' })).toBe('/login?intent=vote')
  })

  it('rejects external and protocol-relative next URLs', () => {
    expect(sanitizeLoginNext('https://example.com')).toBe('/')
    expect(sanitizeLoginNext('//example.com/path')).toBe('/')
    expect(sanitizeLoginNext('/%2Fexample.com/path')).toBe('/')
    expect(sanitizeLoginNext(String.raw`/\example.com/path`)).toBe('/')
    expect(sanitizeLoginNext('/%09/example.com/path')).toBe('/')
    expect(sanitizeLoginNext('/%0a/example.com/path')).toBe('/')
    expect(sanitizeLoginNext('/%0c/example.com/path')).toBe('/')
    expect(sanitizeLoginNext('/%0d/example.com/path')).toBe('/')
    expect(sanitizeLoginNext('/%5C/example.com/path')).toBe('/')
  })

  it('preserves query string encoding on valid URLs', () => {
    expect(sanitizeLoginNext('/search?query=apples%26oranges')).toBe(
      '/search?query=apples%26oranges',
    )
  })
})
