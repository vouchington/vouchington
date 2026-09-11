import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  getRssFeedImportRequestForTest,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { importSingleRssFeed } from './import-rss-feeds.mts'

describe('importSingleRssFeed', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('records followed imports for newly created sources', async () => {
    const rssFeedUrl = `https://new-source-import-${Date.now()}.example.com/feed.xml`
    const rssFeed = await insertTestRssFeedDirect({})
    const createSourceFromUrlImpl = vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
      status: 'created',
      topic_slug: 'new-source-import',
      topic_id: randomUUID(),
      rss_feed_id: rssFeed.id,
    })

    const result = await importSingleRssFeed(user, rssFeedUrl, {
      createSourceFromUrlImpl,
    })

    expect(result).toMatchObject({
      input: rssFeedUrl,
      status: 'source_created',
    })
    const request = await getRssFeedImportRequestForTest(user.id, result!.entity_id!)
    expect(request).toMatchObject({
      rss_feed_id: result?.entity_id,
      input_value: rssFeedUrl,
    })
    expect(request?.followed_at).toBeInstanceOf(Date)
  })

  it('imports a YouTube channel feed URL with a query parameter (regression: bulk import must not reject query params)', async () => {
    const youtubeUrl =
      'https://www.youtube.com/feeds/videos.xml?channel_id=UC4w1YQAJMWOz4qtxinq55LQ'
    const rssFeed = await insertTestRssFeedDirect({})
    const createSourceFromUrlImpl = vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
      status: 'created',
      topic_slug: 'youtube-channel',
      topic_id: randomUUID(),
      rss_feed_id: rssFeed.id,
    })

    const result = await importSingleRssFeed(user, youtubeUrl, {
      createSourceFromUrlImpl,
    })

    expect(result).toMatchObject({ input: youtubeUrl, status: 'source_created' })
    expect(createSourceFromUrlImpl).toHaveBeenCalledWith(
      expect.objectContaining({ id: user.id }),
      youtubeUrl,
      expect.any(Object),
    )
  })

  it('follows existing HTTPS feed when importing equivalent HTTP URL without calling createSourceFromUrl', async () => {
    const hostname = `http-https-dedup-${Date.now()}.example.com`
    const rssFeed = await insertTestRssFeedDirect({ rssFeedUrl: `https://${hostname}/feed.xml` })

    const result = await importSingleRssFeed(user, `http://${hostname}/feed.xml`)

    expect(result).toMatchObject({
      input: `http://${hostname}/feed.xml`,
      status: 'followed',
      entity_id: rssFeed.id,
    })
  })
})
