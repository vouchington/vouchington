import { describe, expect, it } from 'vitest'
import { normalizeSearchToolArgs } from './search-system.mts'

describe('normalizeSearchToolArgs', () => {
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
