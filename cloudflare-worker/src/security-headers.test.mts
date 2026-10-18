import { describe, expect, it } from 'vitest'
import { isKeyedRssReferrerRequest, shouldPreserveOriginNoReferrer } from './security-headers.mts'

describe('shouldPreserveOriginNoReferrer', () => {
  it.each(['facebook', 'x', 'github', 'google', 'linkedin', 'microsoft'])(
    'returns true for the %s OAuth broker callback',
    provider => {
      expect(
        shouldPreserveOriginNoReferrer(
          new URL(`https://voucha.ai/auth/callback/${provider}/broker?code=secret&state=secret`),
        ),
      ).toBe(true)
    },
  )

  it.each([
    '/auth/callback/github/brokered',
    '/auth/callback/github/broker/extra',
    '/auth/callback/github',
    '/auth/callback/google/brokered',
    '/auth/callback/google/broker/extra',
  ])('returns false for callback near miss %s', pathname => {
    expect(shouldPreserveOriginNoReferrer(new URL(`https://voucha.ai${pathname}`))).toBe(false)
  })

  it('returns true for keyed RSS', () => {
    expect(
      shouldPreserveOriginNoReferrer(new URL('https://voucha.ai/rss/posts?apikey=fil_xxx')),
    ).toBe(true)
  })
})

describe('isKeyedRssReferrerRequest', () => {
  it.each(['/rss/posts', '/rss/news', '/rss'])('returns true for keyed RSS route %s', pathname => {
    expect(isKeyedRssReferrerRequest(new URL(`https://voucha.ai${pathname}?apikey=fil_xxx`))).toBe(
      true,
    )
  })

  it('returns false for anonymous RSS', () => {
    expect(isKeyedRssReferrerRequest(new URL('https://voucha.ai/rss/posts'))).toBe(false)
  })

  it('returns false for an empty apikey value', () => {
    expect(isKeyedRssReferrerRequest(new URL('https://voucha.ai/rss/posts?apikey='))).toBe(false)
  })

  it('returns false for non-RSS routes even with an apikey param', () => {
    expect(
      isKeyedRssReferrerRequest(new URL('https://voucha.ai/api/v1/posts?apikey=fil_xxx')),
    ).toBe(false)
  })
})
