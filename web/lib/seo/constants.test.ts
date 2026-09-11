import { describe, it, expect } from 'vitest'
import { SITE_DESCRIPTION, buildAbsoluteUrl, SITE_ORIGIN } from './constants'

describe('SITE_DESCRIPTION', () => {
  it('is non-empty', () => {
    expect(SITE_DESCRIPTION.length).toBeGreaterThan(0)
  })

  it('does not contain "credit card"', () => {
    expect(SITE_DESCRIPTION.toLowerCase()).not.toContain('credit card')
  })
})

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
