import { it, expect, describe } from 'vitest'
import { applyCrawlerRules } from './apply-rules.mts'
import type { Crawler } from './types.mts'

describe('apply-rules.generated', () => {
  it('applyCrawlerRules returns base options when crawler is null', () => {
    const result = applyCrawlerRules(null, {})
    expect(result).toBeDefined()
  })

  it('applyCrawlerRules merges CSS selectors to remove', () => {
    const crawler: Crawler = {
      __entity_type: 'crawler',
      id: 'test-id',
      hostname_id: '00000000-0000-0000-0000-000000000001',
      description: '',
      crawler_type: 'fetch',
      priority: 0,
      css_selectors_to_remove: ['.ad', '.sidebar'],
      link_text_content_to_remove: [],
      link_hrefs_to_remove: [],
      content_selectors: [],
      referral_program_id: null,
      created_at: new Date(),
      updated_at: new Date(),
      created_by: null,
      updated_by: null,
      deleted_by: null,
      deleted_at: null,
    }

    const result = applyCrawlerRules(crawler, {})
    // mergeConfigs merges with default config, so arrays will include defaults
    expect(result.cssSelectorsToRemove).toContain('.ad')
    expect(result.cssSelectorsToRemove).toContain('.sidebar')
  })

  it('applyCrawlerRules merges link removals', () => {
    const crawler: Crawler = {
      __entity_type: 'crawler',
      id: 'test-id',
      hostname_id: '00000000-0000-0000-0000-000000000001',
      description: '',
      crawler_type: 'fetch',
      priority: 0,
      css_selectors_to_remove: [],
      link_text_content_to_remove: ['Skip', 'Next'],
      link_hrefs_to_remove: ['/skip'],
      content_selectors: [],
      referral_program_id: null,
      created_at: new Date(),
      updated_at: new Date(),
      created_by: null,
      updated_by: null,
      deleted_by: null,
      deleted_at: null,
    }

    const result = applyCrawlerRules(crawler, {})
    // mergeConfigs merges with default config, so arrays will include defaults
    expect(result.linkTextContentToRemove).toContain('Skip')
    expect(result.linkTextContentToRemove).toContain('Next')
    expect(result.linkHrefsToRemove).toContain('/skip')
  })

  it('applyCrawlerRules merges with base options', () => {
    const crawler: Crawler = {
      __entity_type: 'crawler',
      id: 'test-id',
      hostname_id: '00000000-0000-0000-0000-000000000001',
      description: '',
      crawler_type: 'fetch',
      priority: 0,
      css_selectors_to_remove: ['.ad'],
      link_text_content_to_remove: [],
      link_hrefs_to_remove: [],
      content_selectors: [],
      referral_program_id: null,
      created_at: new Date(),
      updated_at: new Date(),
      created_by: null,
      updated_by: null,
      deleted_by: null,
      deleted_at: null,
    }

    const baseOptions = {
      cssSelectorsToRemove: ['.base'],
      useTextDensityFilter: true,
    }

    const result = applyCrawlerRules(crawler, baseOptions)
    expect(result.cssSelectorsToRemove).toContain('.ad')
    expect(result.cssSelectorsToRemove).toContain('.base')
    expect(result.useTextDensityFilter).toBe(true)
  })
})
