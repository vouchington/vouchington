import { describe, it, expect } from 'vitest'
import { getListItemStorageConfig, listItemStorageCatalog } from '../catalog.mts'

describe('listItemStorageCatalog', () => {
  it('has entries for all expected item types', () => {
    expect(listItemStorageCatalog).toHaveProperty('rss_feed_item')
    expect(listItemStorageCatalog).toHaveProperty('post')
  })

  it('rss_feed_item config has correct table and column', () => {
    const config = listItemStorageCatalog.rss_feed_item
    expect(config.table).toBe('list_items__rss_feed_items')
    expect(config.entityColumn).toBe('rss_feed_item_id')
  })

  it('post config has correct table and column', () => {
    const config = listItemStorageCatalog.post
    expect(config.table).toBe('list_items__posts')
    expect(config.entityColumn).toBe('post_id')
  })
})

describe('getListItemStorageConfig', () => {
  it('returns rss_feed_item config', () => {
    const config = getListItemStorageConfig('rss_feed_item')
    expect(config.table).toBe('list_items__rss_feed_items')
  })

  it('returns post config', () => {
    const config = getListItemStorageConfig('post')
    expect(config.table).toBe('list_items__posts')
  })
})
