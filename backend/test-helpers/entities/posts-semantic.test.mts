import { describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'

import {
  MAX_POST_SEMANTIC_FIXTURE_SCOPE_IDS,
  queryPostSemanticFixturesFromPrimary,
  queryPostSemanticFixturesScopedToIds,
  scopePostSemanticFixtureQueryToIds,
} from './posts-semantic.mts'

const FIXTURE_POST_ID = '11111111-1111-4111-8111-111111111111'

describe('queryPostSemanticFixturesFromPrimary', () => {
  it('rejects queries that do not use the toolsSearchPostsSemantic guard', async () => {
    await expect(queryPostSemanticFixturesFromPrimary('SELECT 1')).rejects.toThrow(
      'Post semantic fixture queries must use toolsSearchPostsSemantic',
    )
  })
})

describe('queryPostSemanticFixturesScopedToIds', () => {
  it('rejects an empty fixture ID list before querying', () => {
    expect(() => queryPostSemanticFixturesScopedToIds([])).toThrow(
      'fixture post IDs must be a non-empty list',
    )
  })

  it('rejects non-UUID fixture IDs before querying', () => {
    expect(() => queryPostSemanticFixturesScopedToIds(['not-a-uuid'])).toThrow(
      'fixture post IDs must contain only valid UUIDs',
    )
  })

  it('rejects oversize fixture ID lists before querying', () => {
    const ids = Array.from(
      { length: MAX_POST_SEMANTIC_FIXTURE_SCOPE_IDS + 1 },
      (_, index) => `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
    )
    expect(() => queryPostSemanticFixturesScopedToIds(ids)).toThrow(
      `fixture post IDs cannot exceed ${MAX_POST_SEMANTIC_FIXTURE_SCOPE_IDS} entries`,
    )
  })

  it('wraps the production query in a MATERIALIZED public.posts CTE', () => {
    const scoped = scopePostSemanticFixtureQueryToIds(
      sql`/* toolsSearchPostsSemantic */ SELECT posts.id FROM posts`,
      [FIXTURE_POST_ID],
    )

    expect(scoped.text).toContain('WITH posts AS MATERIALIZED')
    expect(scoped.text).toContain('SELECT * FROM public.posts WHERE id = ANY(')
    expect(scoped.text).toContain('/* toolsSearchPostsSemantic */')
    expect(scoped.text).toContain('SELECT posts.id FROM posts')
  })

  it('still rejects scoped queries that omit the toolsSearchPostsSemantic guard', async () => {
    const queryPosts = queryPostSemanticFixturesScopedToIds([FIXTURE_POST_ID])
    await expect(queryPosts('SELECT 1')).rejects.toThrow(
      'Post semantic fixture queries must use toolsSearchPostsSemantic',
    )
  })
})
