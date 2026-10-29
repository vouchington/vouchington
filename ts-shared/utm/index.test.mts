import { describe, expect, it } from 'vitest'
import { resolveUtmSource } from './index.mts'

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
