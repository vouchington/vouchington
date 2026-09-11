import { describe, expect, it } from 'vitest'
import { requireJobFamily, requireJobPostType, requireJobString } from './job-data.mts'

describe('requireJobPostType', () => {
  it('returns a supported post type', () => {
    expect(requireJobPostType('discussion')).toBe('discussion')
    expect(requireJobPostType('review')).toBe('review')
  })

  it('throws for unsupported values', () => {
    expect(() => requireJobPostType(undefined)).toThrow('postType is required')
    expect(() => requireJobPostType('topic')).toThrow('Unsupported postType: topic')
  })
})

describe('requireJobFamily', () => {
  it('returns a supported sitemap family', () => {
    expect(requireJobFamily('topics')).toBe('topics')
    expect(requireJobFamily('landing-pages')).toBe('landing-pages')
  })

  it('throws for unsupported values', () => {
    expect(() => requireJobFamily(undefined)).toThrow('family is required')
    expect(() => requireJobFamily('posts')).toThrow('Unsupported family: posts')
  })
})

describe('requireJobString', () => {
  it('returns a non-empty string', () => {
    expect(requireJobString('2026-03-04', 'day')).toBe('2026-03-04')
  })

  it('throws for missing values', () => {
    expect(() => requireJobString(undefined, 'day')).toThrow('day is required')
    expect(() => requireJobString('', 'day')).toThrow('day is required')
  })
})
