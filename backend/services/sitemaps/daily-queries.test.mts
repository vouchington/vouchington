import { describe, expect, it } from 'vitest'
import { buildPostsForDayQuery } from './daily-queries.mts'

describe('daily sitemap queries', () => {
  it('applies the fixed high water, keyset, and run cap', () => {
    const query = buildPostsForDayQuery('article', '2026-06-10', {
      highWaterId: '0199a000-0000-7000-8000-000000000010',
      afterId: '0199a000-0000-7000-8000-000000000009',
      limit: 2,
    })
    expect(query.text).toMatch(/p\.id <= \$\d+/)
    expect(query.text).toMatch(/p\.id < \$\d+/)
    expect(query.text).toMatch(/LIMIT \$\d+/)
    expect(query.values.at(-1)).toBe(2)
  })

  it('excludes archived posts from daily sitemap coverage', () => {
    const query = buildPostsForDayQuery('article', '2026-06-10').text

    expect(query).toContain('p.archived_at IS NULL')
  })
})
