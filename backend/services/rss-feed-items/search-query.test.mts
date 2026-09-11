import { describe, expect, it } from 'vitest'
import type { SQLStatement } from 'sql-template-strings'
import { appendRssFeedItemsPageClauses } from './search.mts'

describe('appendRssFeedItemsPageClauses', () => {
  it('inlines clamped page limits for generic query planning', () => {
    const fragments: Array<string | SQLStatement> = []
    const query = {
      append(fragment: string | SQLStatement) {
        fragments.push(fragment)
        return query
      },
    } as SQLStatement

    appendRssFeedItemsPageClauses(query, 10)

    const text = fragments
      .map(fragment => (typeof fragment === 'string' ? fragment : fragment.text))
      .join('')
    const values = fragments.flatMap(fragment =>
      typeof fragment === 'string' ? [] : fragment.values,
    )
    expect(text).toContain('LIMIT 11')
    expect(text).toContain('SELECT COUNT(*)::int > 10 AS has_next_page')
    expect(text).toMatch(
      /ORDER BY limited_rss_feed_items\.published_at DESC, limited_rss_feed_items\.id DESC\s+LIMIT 10/,
    )
    expect(values).toEqual([])
  })
})
