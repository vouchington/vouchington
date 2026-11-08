import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  deleteRssFeedsByIds,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers/entities/rss-feeds'
import { insertTestRssFeedItem } from '@voucha/test-helpers/entities/rss-feed-items'
import { insertTestUrl, insertTestUrlDirect } from '@voucha/test-helpers/entities/urls'
import {
  getTestUrlRanking,
  hardDeleteTestRssFeedItem,
  reassignTestRssFeedItemUrl,
  setTestRssFeedItemDate,
} from '@voucha/test-helpers/entities/url-ranking'
import { getTopUrlsByHostnameIds } from '../top-urls.mts'

describe('top URL ranking recomputation', () => {
  it('uses the next publication maximum when the newest item date falls, moves, or is deleted', async () => {
    const hostname = `top-url-recompute-${randomUUID()}.example.com`
    const source = await insertTestUrlDirect(null, `https://${hostname}/source`)
    if (!source) throw new Error('Failed to create ranking URL')
    const targetId = await insertTestUrl({
      url: `https://${hostname}/target`,
      hostnameId: source.hostname.id,
    })
    const feed = await insertTestRssFeedDirect({})
    const insertItem = (isoDate: string) =>
      insertTestRssFeedItem({
        rssFeedId: feed.id,
        urlId: source.id,
        guid: `ranking-${randomUUID()}`,
        itemData: { title: 'Ranking item', isoDate },
        contentSha256: createHash('sha256').update(randomUUID()).digest(),
      })
    const oldestId = await insertItem('2023-01-01T00:00:00Z')
    const middleId = await insertItem('2024-01-01T00:00:00Z')
    const newestId = await insertItem('2025-01-01T00:00:00Z')
    const latest = async (urlId: string) =>
      (await getTestUrlRanking(urlId)).latestPublishedAt?.toISOString() ?? null

    expect(await latest(source.id)).toBe('2025-01-01T00:00:00.000Z')

    await setTestRssFeedItemDate(newestId, '2022-01-01T00:00:00Z')
    expect(await latest(source.id)).toBe('2024-01-01T00:00:00.000Z')

    await reassignTestRssFeedItemUrl(middleId, targetId)
    expect(await latest(source.id)).toBe('2023-01-01T00:00:00.000Z')
    expect(await latest(targetId)).toBe('2024-01-01T00:00:00.000Z')
    expect((await getTopUrlsByHostnameIds([source.hostname.id]))[source.hostname.id]?.[0]?.id).toBe(
      targetId,
    )

    await hardDeleteTestRssFeedItem(oldestId)
    expect(await latest(source.id)).toBe('2022-01-01T00:00:00.000Z')
  })

  it('resets rank after hard deleting an enabled feed without deleting its URL', async () => {
    const feedUrl = `https://top-url-feed-delete-${randomUUID()}.example.com/feed.xml`
    const feed = await insertTestRssFeedDirect({ rssFeedUrl: feedUrl })
    expect(await getTestUrlRanking(feed.rss_feed_url_id)).toMatchObject({ feedRank: 0 })

    await deleteRssFeedsByIds([feed.id])

    expect(await getTestUrlRanking(feed.rss_feed_url_id)).toMatchObject({ feedRank: 1 })
  })
})
