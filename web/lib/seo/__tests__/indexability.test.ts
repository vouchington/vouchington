import { describe, expect, it } from 'vitest'
import { isIndexableForSeo } from '../indexability'

describe('isIndexableForSeo', () => {
  it('returns true for positive scores', () => {
    expect(isIndexableForSeo(1)).toBe(true)
  })

  it('returns false for zero', () => {
    expect(isIndexableForSeo(0)).toBe(false)
  })

  it('returns false for negative scores', () => {
    expect(isIndexableForSeo(-1)).toBe(false)
  })
})
