import { randomUUID, createHash } from 'node:crypto'
import { it, expect, beforeAll, describe } from 'vitest'
import { updateStoryTitle, adminSetStoryOfficialItem } from './update.mts'
import {
  insertTestStory,
  insertTestRssFeedItem,
  createTestUrlWithHostname,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'

describe('update', () => {
  function sha256(data: unknown): Buffer {
    return createHash('sha256').update(JSON.stringify(data)).digest()
  }

  let itemId: string

  beforeAll(async () => {
    const feed = await createTestRssFeed({})
    const urlId = await createTestUrlWithHostname()
    const random = Math.random().toString(36).slice(2, 10)
    const itemData = { title: `Update Test Item ${random}`, link: `https://example.com/${random}` }
    itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId,
      guid: `update-test-${random}`,
      itemData,
      contentSha256: sha256(itemData),
    })
  })

  it('updateStoryTitle updates title', async () => {
    const story = await insertTestStory({ title: 'Old Title' })
    const updated = await updateStoryTitle(story.id, 'New Title')
    expect(updated).toBeDefined()
    expect(updated!.title).toBe('New Title')
  })

  it('updateStoryTitle returns null for unknown story', async () => {
    const result = await updateStoryTitle(randomUUID(), 'Title')
    expect(result).toBeNull()
  })

  it('adminSetStoryOfficialItem sets lock', async () => {
    const story = await insertTestStory()
    const result = await adminSetStoryOfficialItem(story.id, itemId)
    expect(result).toBeDefined()
    expect(result!.official_rss_feed_item_id).toBe(itemId)
    expect(result!.official_locked_at).toBeDefined()
    expect(result!.official_locked_at).not.toBeNull()
  })
})
