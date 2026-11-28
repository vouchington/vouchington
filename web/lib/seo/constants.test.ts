import { describe, it, expect } from 'vitest'
import { buildAbsoluteUrl, SITE_ORIGIN } from './constants'

describe('buildAbsoluteUrl', () => {
  it('returns correct URL for root path', () => {
    expect(buildAbsoluteUrl('/')).toBe(`${SITE_ORIGIN}/`)
  })

  it('returns correct URL for a given path', () => {
    expect(buildAbsoluteUrl('/reviews')).toBe(`${SITE_ORIGIN}/reviews`)
  })

  it('defaults to root when no path provided', () => {
    expect(buildAbsoluteUrl()).toBe(`${SITE_ORIGIN}/`)
  })
})
