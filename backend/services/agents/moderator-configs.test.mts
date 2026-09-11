import { describe, expect, it } from 'vitest'
import { MODERATOR_CONFIGS } from './moderator-configs.mts'

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
    expect(config).toMatchObject({
      slug: 'politics-averse',
      model: 'gpt-5.4-nano',
      provider: 'openai',
      onFlagAction: 'review_queue',
    })
    expect(config?.prompt).toContain('Neutral discussion of news and current events')
    expect(config?.prompt).toContain('Partisan political opinion or persuasion')
    expect(config?.prompt).toContain('reputable sources')
  })

  it('all configs have required fields', () => {
    for (const config of MODERATOR_CONFIGS) {
      expect(config.slug).toBeTruthy()
      expect(config.prompt).toBeTruthy()
      expect(config.model).toBe('gpt-5.4-nano')
      expect(config.provider).toBe('openai')
      expect(['none', 'review_queue']).toContain(config.onFlagAction)
    }
  })

  it('tag-only moderators use the none flag action', () => {
    const configsBySlug = new Map(MODERATOR_CONFIGS.map(config => [config.slug, config]))
    for (const slug of ['click-bait', 'vague-post', 'shit-post']) {
      const config = configsBySlug.get(slug)
      expect(config).toMatchObject({
        slug,
        model: 'gpt-5.4-nano',
        provider: 'openai',
        onFlagAction: 'none',
      })
      expect(config?.prompt).toContain('Respond with:')
    }
  })
})
