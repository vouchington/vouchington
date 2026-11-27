import { describe, expect, it } from 'vitest'
import { feedIsEnabledAndDiscoverableSql } from '@modules/feed-query-builders/discoverability-sql'

describe('feedIsEnabledAndDiscoverableSql', () => {
  it('builds discoverability checks for a safe feed alias', () => {
    const statement = feedIsEnabledAndDiscoverableSql('rf')

    expect(statement.text).toBe('rf.is_enabled = TRUE AND rf.is_discoverable = TRUE')
    expect(statement.values).toEqual([])
  })

  it('rejects unsafe SQL aliases', () => {
    expect(() => feedIsEnabledAndDiscoverableSql('rf; DROP TABLE rss_feeds; --')).toThrow(
      'Unsafe SQL alias',
    )
  })
})
