import { describe, expect, it } from 'vitest'
import { isBaselineModeratorSlug } from './moderator-configs.mts'
import { MODERATOR_CONFIGS } from '@voucha/types/entities/moderator-configs'

describe('moderator configs', () => {
  it('includes all 7 moderators', () => {
    const slugs = MODERATOR_CONFIGS.map(c => c.slug)
    expect(slugs).toContain('self-promotion')
    expect(slugs).toContain('marketplace')
    expect(slugs).toContain('ai-generated')
    expect(slugs).toContain('politics-averse')
    expect(slugs).toContain('click-bait')
    expect(slugs).toContain('vague-post')
    expect(slugs).toContain('shit-post')
    expect(slugs).toHaveLength(7)
  })

  it('politics-averse is a non-baseline identity', () => {
    const config = MODERATOR_CONFIGS.find(c => c.slug === 'politics-averse')
    expect(config).toEqual({ slug: 'politics-averse', baseline: false })
  })

  it('carries only the identity and baseline flag', () => {
    for (const config of MODERATOR_CONFIGS) {
      expect(Object.keys(config).toSorted()).toEqual(['baseline', 'slug'])
      expect(config.slug).toBeTruthy()
    }
  })

  it('marks only ai-generated as the baseline moderator', () => {
    expect(MODERATOR_CONFIGS.filter(c => c.baseline).map(c => c.slug)).toEqual(['ai-generated'])
    expect(isBaselineModeratorSlug('ai-generated')).toBe(true)
    expect(isBaselineModeratorSlug('self-promotion')).toBe(false)
    expect(isBaselineModeratorSlug('not-a-moderator')).toBe(false)
  })
})
