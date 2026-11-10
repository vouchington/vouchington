import { describe, expect, it } from 'vitest'
import { searchPostsVertical } from './omnisearch-content-verticals.mts'

describe('omnisearch post vertical', () => {
  it('returns an empty page for an unknown hashtag', async () => {
    await expect(searchPostsVertical({ hasUnknownHashtag: true })).resolves.toEqual({
      results: [],
      page_info: { start_cursor: null, end_cursor: null, has_next_page: false },
    })
  })
})
