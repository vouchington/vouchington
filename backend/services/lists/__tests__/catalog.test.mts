import { describe, it, expect } from 'vitest'
import { getListItemStorageConfig } from '../catalog.mts'

describe('getListItemStorageConfig', () => {
  it('returns the rss feed item table and column', () => {
    const config = getListItemStorageConfig('rss_feed_item')
    expect(config.table).toBe('user_list_rss_feed_items')
    expect(config.entityColumn).toBe('rss_feed_item_id')
  })

  it('returns the post table and column', () => {
    const config = getListItemStorageConfig('post')
    expect(config.table).toBe('user_list_posts')
    expect(config.entityColumn).toBe('post_id')
  })
})
