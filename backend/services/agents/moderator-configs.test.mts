import { describe, expect, it } from 'vitest'
import { MODERATOR_CONFIGS, isBaselineModeratorSlug } from './moderator-configs.mts'

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

  it('politics-averse has correct config', () => {
    const config = MODERATOR_CONFIGS.find(c => c.slug === 'politics-averse')
    expect(config).toMatchObject({ slug: 'politics-averse', baseline: false })
    expect(config?.prompt).toContain('Neutral discussion of news and current events')
    expect(config?.prompt).toContain('Partisan political opinion or persuasion')
    expect(config?.prompt).toContain('reputable sources')
  })

  it('carries only the identity, prompt text and baseline flag', () => {
    for (const config of MODERATOR_CONFIGS) {
      expect(Object.keys(config).toSorted()).toEqual(['baseline', 'prompt', 'slug'])
      expect(config.slug).toBeTruthy()
      expect(config.prompt).toBeTruthy()
    }
  })

  it('tag-only moderators ask for a structured response', () => {
    const configsBySlug = new Map(MODERATOR_CONFIGS.map(config => [config.slug, config]))
    for (const slug of ['click-bait', 'vague-post', 'shit-post']) {
      expect(configsBySlug.get(slug)?.prompt).toContain('Respond with:')
    }
  })

  it('marks only ai-generated as the baseline moderator', () => {
    expect(MODERATOR_CONFIGS.filter(c => c.baseline).map(c => c.slug)).toEqual(['ai-generated'])
    expect(isBaselineModeratorSlug('ai-generated')).toBe(true)
    expect(isBaselineModeratorSlug('self-promotion')).toBe(false)
    expect(isBaselineModeratorSlug('not-a-moderator')).toBe(false)
  })
})
