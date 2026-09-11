import { describe, expect, it } from 'vitest'
import { resolveUtmSource, extractUtmParams } from './index.mts'

describe('resolveUtmSource', () => {
  it('resolves ig to instagram', () => {
    expect(resolveUtmSource('ig')).toBe('instagram')
  })

  it('resolves tw to twitter', () => {
    expect(resolveUtmSource('tw')).toBe('twitter')
  })

  it('resolves x to twitter', () => {
    expect(resolveUtmSource('x')).toBe('twitter')
  })

  it('resolves fb to facebook', () => {
    expect(resolveUtmSource('fb')).toBe('facebook')
  })

  it('resolves li to linkedin', () => {
    expect(resolveUtmSource('li')).toBe('linkedin')
  })

  it('resolves yt to youtube', () => {
    expect(resolveUtmSource('yt')).toBe('youtube')
  })

  it('resolves tt to tiktok', () => {
    expect(resolveUtmSource('tt')).toBe('tiktok')
  })

  it('resolves rd to reddit', () => {
    expect(resolveUtmSource('rd')).toBe('reddit')
  })

  it('passes through unknown values', () => {
    expect(resolveUtmSource('google')).toBe('google')
  })

  it('is case insensitive', () => {
    expect(resolveUtmSource('IG')).toBe('instagram')
    expect(resolveUtmSource('Tw')).toBe('twitter')
  })

  it('trims whitespace', () => {
    expect(resolveUtmSource(' ig ')).toBe('instagram')
  })
})

describe('extractUtmParams', () => {
  it('extracts utm_source', () => {
    const url = new URL('https://example.com/?utm_source=google')
    const params = extractUtmParams(url)
    expect(params.utmSource).toBe('google')
  })

  it('resolves utm_source shortcodes', () => {
    const url = new URL('https://example.com/?utm_source=ig')
    const params = extractUtmParams(url)
    expect(params.utmSource).toBe('instagram')
  })

  it('falls back to ref param for source', () => {
    const url = new URL('https://example.com/?ref=fb')
    const params = extractUtmParams(url)
    expect(params.utmSource).toBe('facebook')
  })

  it('prefers utm_source over ref', () => {
    const url = new URL('https://example.com/?utm_source=google&ref=ig')
    const params = extractUtmParams(url)
    expect(params.utmSource).toBe('google')
  })

  it('extracts all utm params', () => {
    const url = new URL(
      'https://example.com/?utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_content=banner',
    )
    const params = extractUtmParams(url)
    expect(params.utmSource).toBe('google')
    expect(params.utmMedium).toBe('cpc')
    expect(params.utmCampaign).toBe('spring')
    expect(params.utmContent).toBe('banner')
  })

  it('returns null for missing params', () => {
    const url = new URL('https://example.com/')
    const params = extractUtmParams(url)
    expect(params.utmSource).toBeNull()
    expect(params.utmMedium).toBeNull()
    expect(params.utmCampaign).toBeNull()
    expect(params.utmContent).toBeNull()
  })
})
