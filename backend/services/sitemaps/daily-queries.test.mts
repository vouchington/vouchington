import { describe, expect, it } from 'vitest'
import { buildPostsForDayQuery, iteratePostsForDay } from './daily-queries.mts'

describe('daily sitemap queries', () => {
  it('creates an async iterable for daily post entries', () => {
    expect(iteratePostsForDay('article', '2026-06-10')[Symbol.asyncIterator]).toBeTypeOf('function')
  })

  it('excludes archived posts from daily sitemap coverage', () => {
    const query = buildPostsForDayQuery('article', '2026-06-10').text

    expect(query).toContain('p.archived_at IS NULL')
  })
})
