import { describe, expect, it } from 'vitest'
import { paginationConfig } from '@services/pagination'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { clampToolLimit, normalizeSearchToolArgs } from './search-system.mts'

describe('normalizeSearchToolArgs', () => {
  it('uses current runtime defaults and independent profile ceilings', () => {
    overrideDynamicConfigFieldsForTest(paginationConfig, {
      default_limit: 2,
      max_limit: 4,
      small_max_limit: 6,
      trending_max_limit: 8,
      descendants_max_limit: 12,
    })
    expect(clampToolLimit(undefined, 25, 100)).toBe(2)
    expect(clampToolLimit(100, 25, 100)).toBe(4)
    expect(clampToolLimit(100, 10, 25)).toBe(6)
    expect(clampToolLimit(100, 20, 50)).toBe(8)
    expect(clampToolLimit(200, 100, 200)).toBe(12)
  })
  it('maps search alias to text and semantic queries', () => {
    expect(
      normalizeSearchToolArgs(
        {
          search: 'travel cards',
          similar_rss_feed_item_id: '123e4567-e89b-12d3-a456-426614174000',
          limit: 99,
        },
        { defaultLimit: 10, maxLimit: 25 },
      ),
    ).toMatchObject({
      limit: 25,
      text_search_query: 'travel cards',
      semantic_search_query: 'travel cards',
      similar_rss_feed_item_id: '123e4567-e89b-12d3-a456-426614174000',
    })
  })

  it('preserves explicit split queries over search alias', () => {
    expect(
      normalizeSearchToolArgs(
        {
          search: 'hybrid',
          text_search_query: 'text only',
          semantic_search_query: 'semantic only',
        },
        { defaultLimit: 10, maxLimit: 25 },
      ),
    ).toMatchObject({
      limit: 10,
      text_search_query: 'text only',
      semantic_search_query: 'semantic only',
    })
  })
})
