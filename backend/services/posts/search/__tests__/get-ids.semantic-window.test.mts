import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  overrideDynamicConfigFieldsForTest,
  seedSearchEmbeddingCache,
} from '@voucha/test-helpers'
import { postsWorkConfig } from '@services/posts/work-limits'
import {
  createSemanticWindowEmbedding,
  insertSemanticWindowPosts,
} from '../../../../test-helpers/post-semantic-window.mts'
import { getPostIds } from '../get-ids.mts'
import { getPostFacets } from '../get-facets.mts'

describe('semantic search candidate paging', () => {
  it('ends pagination at the candidate window and counts the same candidates', async () => {
    const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      semantic_post_candidate_limit: 2,
    })
    try {
      const user = await createTestUser()
      const embedding = createSemanticWindowEmbedding()
      const ids = await insertSemanticWindowPosts(user.id, 3, embedding)
      const query = randomUUID()
      await seedSearchEmbeddingCache(query, embedding)
      const options = { user_id: user.id, semantic_search_query: query, sort: 'relevance' as const }
      const first = await getPostIds(user, { ...options, limit: 1 })
      expect(first.results.map(result => result.id)).toEqual(ids.slice(0, 1))
      expect(first.page_info.has_next_page).toBe(true)
      expect(first.page_info.end_cursor).toBeTruthy()
      const last = await getPostIds(user, {
        ...options,
        limit: 1,
        after: first.page_info.end_cursor ?? undefined,
      })
      expect(last.results.map(result => result.id)).toEqual(ids.slice(1, 2))
      expect(last.page_info.has_next_page).toBe(false)
      expect(await getPostFacets(user, options)).toEqual({ total_count: 2 })
    } finally {
      restore()
    }
  })

  it('fills a selective page and preserves distance ranking for semantic and hybrid queries', async () => {
    const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      semantic_post_candidate_limit: 3,
    })
    try {
      const other = await createTestUser()
      const embedding = createSemanticWindowEmbedding()
      await insertSemanticWindowPosts(other.id, 2, embedding)
      const user = await createTestUser()
      const ids = await insertSemanticWindowPosts(user.id, 3, embedding)
      const query = randomUUID()
      await seedSearchEmbeddingCache(query, embedding)
      for (const text of [undefined, 'fixture']) {
        const page = await getPostIds(user, {
          user_id: user.id,
          semantic_search_query: query,
          text_search_query: text,
          sort: 'relevance',
          limit: 2,
        })
        expect(page.results.map(result => result.id)).toEqual(ids.slice(0, 2))
        expect(page.page_info.has_next_page).toBe(true)
        const last = await getPostIds(user, {
          user_id: user.id,
          semantic_search_query: query,
          text_search_query: text,
          sort: 'relevance',
          limit: 2,
          after: page.page_info.end_cursor ?? undefined,
        })
        expect(last.results.map(result => result.id)).toEqual(ids.slice(2))
        expect(last.page_info.has_next_page).toBe(false)
      }
    } finally {
      restore()
    }
  })
})
