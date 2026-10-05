import {
  ISOLATED_DATABASE_PARENT_TIMEOUT_MS,
  runIsolatedDatabaseCase,
} from '../../../../../test-helpers/vitest-isolated-database-case.mts'
import { getIsolatedDatabaseCaseMode } from '../../../../../test-helpers/vitest-isolated-database-cases.mts'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, seedSearchEmbeddingCache } from '@voucha/test-helpers'
import {
  createSemanticWindowEmbedding,
  insertSemanticWindowPosts,
} from '../../../../test-helpers/post-semantic-window.mts'
import { getPostIds } from '../get-ids.mts'
import { getPostFacets } from '../get-facets.mts'
import { SEMANTIC_POST_CANDIDATE_LIMIT } from '../query-builder/semantic-candidates.mts'

describe('semantic search candidate paging', () => {
  it(
    'ends pagination at the fixed window and counts the same candidates',
    async () => {
      if (getIsolatedDatabaseCaseMode('semantic-post-window-cap') === 'parent') {
        await runIsolatedDatabaseCase('semantic-post-window-cap')
        return
      }
      const user = await createTestUser()
      const embedding = createSemanticWindowEmbedding()
      const ids = await insertSemanticWindowPosts(
        user.id,
        SEMANTIC_POST_CANDIDATE_LIMIT + 3,
        embedding,
      )
      const query = randomUUID()
      await seedSearchEmbeddingCache(query, embedding)
      const seen = new Set<string>()
      let after: string | undefined
      for (let pageNumber = 0; pageNumber < 11; pageNumber++) {
        const page = await getPostIds(user, {
          user_id: user.id,
          semantic_search_query: query,
          sort: 'relevance',
          limit: 100,
          after,
        })
        for (const result of page.results) {
          expect(seen.has(result.id)).toBe(false)
          seen.add(result.id)
        }
        if (!page.page_info.has_next_page) break
        expect(page.page_info.end_cursor).toBeTruthy()
        after = page.page_info.end_cursor ?? undefined
      }
      expect(seen.size).toBe(SEMANTIC_POST_CANDIDATE_LIMIT)
      expect([...seen]).toEqual(ids.slice(0, SEMANTIC_POST_CANDIDATE_LIMIT))
      expect(await getPostFacets(user, { user_id: user.id, semantic_search_query: query })).toEqual(
        {
          total_count: SEMANTIC_POST_CANDIDATE_LIMIT,
        },
      )
    },
    ISOLATED_DATABASE_PARENT_TIMEOUT_MS,
  )

  it(
    'fills a selective page and preserves distance ranking for semantic and hybrid queries',
    async () => {
      if (getIsolatedDatabaseCaseMode('semantic-post-window-selective') === 'parent') {
        await runIsolatedDatabaseCase('semantic-post-window-selective')
        return
      }
      const other = await createTestUser()
      const embedding = createSemanticWindowEmbedding()
      await insertSemanticWindowPosts(other.id, 100, embedding)
      const user = await createTestUser()
      const ids = await insertSemanticWindowPosts(user.id, 30, embedding)
      const query = randomUUID()
      await seedSearchEmbeddingCache(query, embedding)
      for (const text of [undefined, 'fixture']) {
        const page = await getPostIds(user, {
          user_id: user.id,
          semantic_search_query: query,
          text_search_query: text,
          sort: 'relevance',
          limit: 25,
        })
        expect(page.results.map(result => result.id)).toEqual(ids.slice(0, 25))
        expect(page.page_info.has_next_page).toBe(true)
        const last = await getPostIds(user, {
          user_id: user.id,
          semantic_search_query: query,
          text_search_query: text,
          sort: 'relevance',
          limit: 25,
          after: page.page_info.end_cursor ?? undefined,
        })
        expect(last.results.map(result => result.id)).toEqual(ids.slice(25))
        expect(last.page_info.has_next_page).toBe(false)
      }
    },
    ISOLATED_DATABASE_PARENT_TIMEOUT_MS,
  )
})
