import { describe, it, expect } from 'vitest'
import { getReadStateStorageConfig, readStateStorageCatalog } from '../catalog.mts'

describe('readStateStorageCatalog', () => {
  it('has entries for all expected entity types', () => {
    expect(readStateStorageCatalog).toHaveProperty('rss_feed_item')
    expect(readStateStorageCatalog).toHaveProperty('post')
  })

  it('rss_feed_item config has correct table and column', () => {
    const config = readStateStorageCatalog.rss_feed_item
    expect(config.table).toBe('rss_feed_item_read_states')
    expect(config.column).toBe('rss_feed_item_id')
  })

  it('post config has correct table and column', () => {
    const config = readStateStorageCatalog.post
    expect(config.table).toBe('post_read_states')
    expect(config.column).toBe('post_id')
  })
})

describe('getReadStateStorageConfig', () => {
  it('returns rss_feed_item config', () => {
    const config = getReadStateStorageConfig('rss_feed_item')
    expect(config.table).toBe('rss_feed_item_read_states')
    expect(config.column).toBe('rss_feed_item_id')
  })

  it('returns post config', () => {
    const config = getReadStateStorageConfig('post')
    expect(config.table).toBe('post_read_states')
    expect(config.column).toBe('post_id')
  })
})
