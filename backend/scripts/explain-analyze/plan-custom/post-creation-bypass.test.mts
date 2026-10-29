import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertPostCreationBypassPointRead } from './post-creation-bypass.mts'

function result(queryText: string, condition: Record<string, string>): ExplainResult {
  return {
    name: 'post-creation-bypass-test',
    query_text: queryText,
    plan: {
      Plan: {
        'Node Type': 'Aggregate',
        Plans: [
          {
            'Node Type': 'Index Scan',
            'Relation Name': 'posts',
            'Index Name': 'posts_pkey',
            ...condition,
          },
        ],
      },
    },
    execution_time_ms: 0,
    planning_time_ms: 0,
    timestamp: '2026-10-07T00:00:00.000Z',
  }
}

describe('assertPostCreationBypassPointRead', () => {
  const boundedSql = 'SELECT has_creation_moderation_bypass FROM posts WHERE id = $1'

  it('accepts a post id index point read', () => {
    expect(() =>
      assertPostCreationBypassPointRead(result(boundedSql, { 'Index Cond': '(id = $1)' })),
    ).not.toThrow()
    expect(() =>
      assertPostCreationBypassPointRead(
        result(boundedSql, {
          'Relation Name': 'posts__default',
          'Index Name': 'posts__default_pkey',
          'Index Cond': "(id = '01a18261-a600-7000-8000-000000000000'::uuid)",
        }),
      ),
    ).not.toThrow()
  })

  it('rejects a query without a post id bind even when the scan is selective', () => {
    expect(() =>
      assertPostCreationBypassPointRead(
        result('SELECT has_creation_moderation_bypass FROM posts WHERE title = $1', {
          'Index Cond': '(id = $1)',
        }),
      ),
    ).toThrow(/must point-read posts by id/)
  })

  it('rejects a post scan that does not apply the id bound in its index condition', () => {
    expect(() =>
      assertPostCreationBypassPointRead(result(boundedSql, { Filter: '(id = $1)' })),
    ).toThrow(/must point-read posts by id/)
  })

  it('rejects an alternate index even when it constrains the id', () => {
    expect(() =>
      assertPostCreationBypassPointRead(
        result(boundedSql, { 'Index Name': 'posts_title_idx', 'Index Cond': '(id = $1)' }),
      ),
    ).toThrow(/must point-read posts by id/)
  })
})
