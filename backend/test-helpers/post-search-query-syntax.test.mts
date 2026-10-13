import { describe, expect, it } from 'vitest'
import { parsePostgresSql } from 'no-mistakes'
import { buildPostSearchQuery } from '../services/posts/search/query-builder.mts'
import type { PostSearchSort } from '../services/posts/search/types.mts'

describe('post search SQL composition', () => {
  const sorts: PostSearchSort[] = ['new', 'best', 'hot', 'relevance', 'following_new']
  for (const sort of sorts) {
    for (const mode of ['plain', 'semantic', 'hybrid']) {
      it(`parses the ${mode} ${sort} query with selected expressions and joins`, async () => {
        const query = buildPostSearchQuery(undefined, {
          sort,
          limit: 26,
          ...(mode !== 'plain' && {
            semantic_search_query: 'fixture',
            semanticSearchEmbedding: [1, ...Array<number>(1023).fill(0)],
          }),
          ...(mode === 'hybrid' && { text_search_query: 'fixture' }),
        })
        const facts = await parsePostgresSql({ sql: query.text })
        expect(facts.diagnostics).toEqual([])
      })
    }
  }
})
