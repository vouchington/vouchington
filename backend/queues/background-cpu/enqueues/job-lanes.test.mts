import { describe, expect, it } from 'vitest'
import { contentAnalysisOrderingKey, crawlOrderingKey } from './job-lanes.mts'

describe('background CPU job lanes', () => {
  it('keeps externally flooded boilerplate off crawl tasks and dispatchers', () => {
    expect(crawlOrderingKey('boilerplate_removal', false)).toBe('crawl:boilerplate')
    expect(crawlOrderingKey('crawl_url', false)).toBe('crawl:task')
    expect(crawlOrderingKey('boilerplate_removal_dispatcher', true)).toBe('crawl:dispatch')
    expect(
      new Set([
        crawlOrderingKey('boilerplate_removal', false),
        crawlOrderingKey('crawl_url', false),
        crawlOrderingKey('boilerplate_removal_dispatcher', true),
      ]).size,
    ).toBe(3)
  })

  it('keeps content analysis dispatchers out of its task lane', () => {
    expect(contentAnalysisOrderingKey(false)).toBe('content-analysis:task')
    expect(contentAnalysisOrderingKey(true)).toBe('content-analysis:dispatch')
  })
})
