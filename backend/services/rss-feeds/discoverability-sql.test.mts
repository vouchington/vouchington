import { describe, expect, it } from 'vitest'
import { feedIsEnabledAndDiscoverableSql } from './discoverability-sql.mts'

describe('feedIsEnabledAndDiscoverableSql', () => {
  it('builds discoverability checks for a safe feed alias', () => {
    const statement = feedIsEnabledAndDiscoverableSql('rf')

    expect(statement.text).toContain('FROM view_rss_feed_current_states current_state')
    expect(statement.text).toContain('WHERE current_state.rss_feed_id = rf.id')
    expect(statement.text).toContain('current_state.is_enabled = TRUE')
    expect(statement.text).toContain('current_state.is_discoverable = TRUE')
  })

  it('rejects unsafe SQL aliases', () => {
    expect(() => feedIsEnabledAndDiscoverableSql('rf; DROP TABLE rss_feeds; --')).toThrow(
      'Unsafe SQL alias',
    )
  })
})
