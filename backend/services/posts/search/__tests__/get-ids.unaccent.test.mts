import { it, expect, describe } from 'vitest'
import { getPostIds } from '../get-ids.mts'
import { createTestPost, createTestUser, createRandomString } from '@voucha/test-helpers'

// posts.search_vector is trigger-maintained (fn_sync_posts_search_vector, scoped to
// BEFORE INSERT OR UPDATE OF title, markdown — see 0070-00-00-posts-feed-content.sql) rather than
// a generated column, so this exercises the write-side trigger and the read-side
// websearch_to_tsquery('voucha_english', ...) CTE (query-builder/ctes.mts) end to end.
describe('getPostIds unaccent folding', () => {
  it('finds a post with an accented title via an unaccented search query', async () => {
    const user = await createTestUser()
    const random = createRandomString(10)

    const post = await createTestPost({
      user,
      title: `José Ñandú ${random}`,
    })

    const { results } = await getPostIds(undefined, {
      user_id: user.id,
      text_search_query: `Jose Nandu ${random}`,
      sort: 'relevance',
    })

    expect(results.some(r => r.id === post.id)).toBe(true)
  })
})
