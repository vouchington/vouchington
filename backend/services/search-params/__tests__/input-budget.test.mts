import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { searchParamsConfig } from '../config.mts'
import { parsePostsSearchParams } from '../parse-posts.mts'

describe('search input budget', () => {
  it('enforces the lowered raw topic budget before deduplication and resolution', async () => {
    const restore = overrideDynamicConfigFieldsForTest(searchParamsConfig, {
      max_topic_search_terms: 1,
    })
    try {
      await expect(parsePostsSearchParams({ topics: 'same,same' })).rejects.toMatchObject({
        status: 400,
        message: 'Too many topic identifiers (max 1)',
      })
      await expect(parsePostsSearchParams({ topic: 'same', q: '#same' })).rejects.toMatchObject({
        status: 400,
        message: 'Too many topic identifiers (max 1)',
      })
      await expect(parsePostsSearchParams({ q: '#same #same' })).rejects.toMatchObject({
        status: 400,
        message: 'Too many hashtag topic identifiers (max 1)',
      })
      const result = await parsePostsSearchParams({ topic: `missing-${crypto.randomUUID()}` })
      expect(result.shouldReturnEmpty).toBe(true)
      const literal = await parsePostsSearchParams({
        q: '#first #second',
        post_types: 'topic_recommendation',
      })
      expect(literal.searchOptions).not.toHaveProperty('hashtag_alias_ids')
    } finally {
      restore()
    }
  })
})
