import { describe, expect, it } from 'vitest'
import { insertTestRssFeedDirect } from '@voucha/test-helpers'
import { getRssFeedItemById } from './get.mts'
import { upsertRssFeedItems } from './upsert.mts'

describe('upsert RSS media metadata', () => {
  it('updates media fields when content is unchanged', async () => {
    const feed = await insertTestRssFeedDirect({})
    const suffix = Math.random().toString(36).slice(2, 15)
    const baseItem = {
      link: `https://example.com/video-${suffix}`,
      guid: `video-${suffix}`,
      title: 'Stable video title',
    }
    const [created] = await upsertRssFeedItems(feed.id, [baseItem])
    const mediaItem = {
      ...baseItem,
      media_type: 'video' as const,
      video_id: 'rss-video',
      video_platform: 'youtube',
      player_url: 'https://www.youtube-nocookie.com/embed/rss-video',
    }

    const updated = await upsertRssFeedItems(feed.id, [mediaItem])

    expect(updated).toHaveLength(1)
    expect(updated[0].id).toBe(created.id)
    expect((await getRssFeedItemById(created.id))!.data).toMatchObject({
      media_type: 'video',
      video_id: 'rss-video',
      video_platform: 'youtube',
      player_url: 'https://www.youtube-nocookie.com/embed/rss-video',
    })
    expect(await upsertRssFeedItems(feed.id, [mediaItem])).toHaveLength(0)
  })
})
