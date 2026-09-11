import { describe, expect, it } from 'vitest'
import {
  executeRssFeedItemSourceInsertForTest,
  getRssFeedItemSourcePublicationForTest,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { v7 as uuidv7 } from 'uuid'
import { upsertRssFeedItems } from './upsert.mts'
import { buildRssFeedItemSourcesQuery } from './upsert-sources.mts'

describe('buildRssFeedItemSourcesQuery', () => {
  it('keeps a missing UUIDv7 item in the insert so the source foreign key rejects it', async () => {
    const feed = await insertTestRssFeedDirect({})

    await expect(
      executeRssFeedItemSourceInsertForTest(
        buildRssFeedItemSourcesQuery(feed.id, [{ id: uuidv7() }]),
      ),
    ).rejects.toThrow('violates foreign key constraint')
  })

  it('captures this feed payload date instead of the shared item publication date', async () => {
    const hostname = `source-payload-${crypto.randomUUID()}.example.com`
    const itemFeed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${hostname}/item.xml`,
      topicHostname: `item-${hostname}`,
    })
    const sourceFeed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${hostname}/source.xml`,
      topicHostname: `source-${hostname}`,
    })
    const itemDate = '2025-01-02T03:04:05.000Z'
    const sourceDate = '2020-01-02T03:04:05.000Z'
    const [item] = await upsertRssFeedItems(itemFeed.id, [
      {
        guid: `source-payload-${crypto.randomUUID()}`,
        isoDate: itemDate,
        link: `https://${hostname}/item`,
        title: 'Shared item with a later global publication date',
      },
    ])

    await executeRssFeedItemSourceInsertForTest(
      buildRssFeedItemSourcesQuery(sourceFeed.id, [{ id: item.id, isoDate: sourceDate }]),
    )

    const source = await getRssFeedItemSourcePublicationForTest(sourceFeed.id, item.id)
    expect(source.item_published_at).toEqual(new Date(itemDate))
    expect(source.source_published_at).toEqual(new Date(sourceDate))
  })

  it('rejects an empty source input', () => {
    expect(() => buildRssFeedItemSourcesQuery('feed-id', [])).toThrow(
      'requires at least one RSS feed item ID',
    )
  })
})
