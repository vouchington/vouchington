import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  insertTestRssFeedDirect,
  disableTestRssFeed,
  ensureTestRssFeedEnabled,
} from '@voucha/test-helpers/entities/rss-feeds'
import { insertTestRssFeedItem } from '@voucha/test-helpers/entities/rss-feed-items'
import { insertTestUrl, insertTestUrlDirect } from '@voucha/test-helpers/entities/urls'
import {
  getTestUrlRanking,
  hardDeleteTestRssFeedItem,
  moveTestRssFeedUrl,
  reassignTestRssFeedItemUrl,
  rollBackTestRssFeedItemMoveAndDate,
  setTestRssFeedItemDate,
  softDeleteTestRssFeed,
  softDeleteTestRssFeedItem,
} from '@voucha/test-helpers/entities/url-ranking'
import { getTopUrlsByHostnameIds, TOP_URLS_PER_HOSTNAME } from './top-urls.mts'

async function createRankedHostname() {
  const hostname = `top-urls-${randomUUID()}.example.com`
  const first = await insertTestUrlDirect(null, `https://${hostname}/0`)
  if (!first) throw new Error('Failed to create ranking hostname')
  const hostnameId = first.hostname.id
  const urls = [{ id: first.id, url: first.url }]
  for (let index = 1; index <= TOP_URLS_PER_HOSTNAME; index++) {
    const url = `https://${hostname}/${index}`
    const id = await insertTestUrl({ url, hostnameId })
    urls.push({ id, url })
  }
  return { hostnameId, urls }
}

async function topIds(hostnameId: string): Promise<string[]> {
  const result = await getTopUrlsByHostnameIds([hostnameId, hostnameId])
  return result[hostnameId]?.map(url => url.id) ?? []
}

describe('getTopUrlsByHostnameIds', () => {
  it('maintains the exact five URL boundary when an item is inserted, reassigned, edited, and deleted', async () => {
    const { hostnameId, urls } = await createRankedHostname()
    const initial = await topIds(hostnameId)
    expect(initial).toHaveLength(TOP_URLS_PER_HOSTNAME)
    const outsideId = urls.find(url => !initial.includes(url.id))!.id
    const destinationId = initial.at(-1)!

    const feed = await insertTestRssFeedDirect({})
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: outsideId,
      guid: `ranking-${randomUUID()}`,
      itemData: { title: 'Ranking item', isoDate: '2025-01-01T00:00:00Z' },
      contentSha256: createHash('sha256').update(randomUUID()).digest(),
    })
    expect((await topIds(hostnameId))[0]).toBe(outsideId)
    expect(await topIds(hostnameId)).not.toContain(destinationId)
    expect((await getTestUrlRanking(outsideId)).latestPublishedAt?.toISOString()).toBe(
      '2025-01-01T00:00:00.000Z',
    )

    await softDeleteTestRssFeedItem(itemId)
    expect((await topIds(hostnameId))[0]).toBe(outsideId)

    await reassignTestRssFeedItemUrl(itemId, destinationId)
    expect((await topIds(hostnameId))[0]).toBe(destinationId)
    expect(await getTestUrlRanking(outsideId)).toMatchObject({ latestPublishedAt: null })
    expect(await topIds(hostnameId)).not.toContain(outsideId)

    // A pre-epoch publication sorts below a URL with no items (the epoch fallback).
    await setTestRssFeedItemDate(itemId, '1960-01-01T00:00:00Z')
    expect(await topIds(hostnameId)).not.toContain(destinationId)
    expect(await topIds(hostnameId)).toContain(outsideId)

    await hardDeleteTestRssFeedItem(itemId)
    expect(await getTestUrlRanking(destinationId)).toMatchObject({ latestPublishedAt: null })
    expect(await topIds(hostnameId)).toEqual(initial)
    expect(await getTopUrlsByHostnameIds([])).toEqual({})
  })

  it('prioritizes only enabled active feed URLs as feed assignment and state change', async () => {
    const { hostnameId, urls } = await createRankedHostname()
    const initial = await topIds(hostnameId)
    const outside = urls.find(url => !initial.includes(url.id))!
    const feed = await insertTestRssFeedDirect({ rssFeedUrl: outside.url })
    expect(await getTestUrlRanking(outside.id)).toMatchObject({ feedRank: 0 })
    expect((await topIds(hostnameId))[0]).toBe(outside.id)

    await disableTestRssFeed(feed.id)
    expect(await getTestUrlRanking(outside.id)).toMatchObject({ feedRank: 1 })
    expect(await topIds(hostnameId)).toEqual(initial)

    await ensureTestRssFeedEnabled(feed.id)
    expect((await topIds(hostnameId))[0]).toBe(outside.id)

    const movedToId = initial.at(-1)!
    await moveTestRssFeedUrl(feed.id, movedToId)
    expect(await getTestUrlRanking(outside.id)).toMatchObject({ feedRank: 1 })
    expect(await getTestUrlRanking(movedToId)).toMatchObject({ feedRank: 0 })
    expect((await topIds(hostnameId))[0]).toBe(movedToId)

    await softDeleteTestRssFeed(feed.id)
    expect(await getTestUrlRanking(movedToId)).toMatchObject({ feedRank: 1 })
    expect(await topIds(hostnameId)).toEqual(initial)
  })

  it('keeps the URL projection unchanged when an item move and date edit roll back', async () => {
    const hostname = `top-urls-rollback-${randomUUID()}.example.com`
    const source = await insertTestUrlDirect(null, `https://${hostname}/source`)
    if (!source) throw new Error('Failed to create ranking URL')
    const targetId = await insertTestUrl({
      url: `https://${hostname}/target`,
      hostnameId: source.hostname.id,
    })
    const feed = await insertTestRssFeedDirect({})
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: source.id,
      guid: `ranking-${randomUUID()}`,
      itemData: { title: 'Rolled back item', isoDate: '2025-01-01T00:00:00Z' },
      contentSha256: createHash('sha256').update(randomUUID()).digest(),
    })
    const before = await getTopUrlsByHostnameIds([source.hostname.id])

    await rollBackTestRssFeedItemMoveAndDate(itemId, targetId, '1960-01-01T00:00:00Z')

    expect(await getTopUrlsByHostnameIds([source.hostname.id])).toEqual(before)
    expect((await getTestUrlRanking(source.id)).latestPublishedAt?.toISOString()).toBe(
      '2025-01-01T00:00:00.000Z',
    )
    expect(await getTestUrlRanking(targetId)).toMatchObject({ latestPublishedAt: null })
  })

  it('retains the exact maximum after concurrent item inserts for one URL', async () => {
    const url = await insertTestUrlDirect(
      null,
      `https://top-urls-concurrent-${randomUUID()}.example.com/item`,
    )
    if (!url) throw new Error('Failed to create ranking URL')
    const feed = await insertTestRssFeedDirect({})
    const insertItem = (isoDate: string) =>
      insertTestRssFeedItem({
        rssFeedId: feed.id,
        urlId: url.id,
        guid: `ranking-${randomUUID()}`,
        itemData: { title: 'Concurrent item', isoDate },
        contentSha256: createHash('sha256').update(randomUUID()).digest(),
      })

    await Promise.all([insertItem('2024-01-01T00:00:00Z'), insertItem('2025-01-01T00:00:00Z')])

    expect((await getTestUrlRanking(url.id)).latestPublishedAt?.toISOString()).toBe(
      '2025-01-01T00:00:00.000Z',
    )
    expect((await topIds(url.hostname.id))[0]).toBe(url.id)
  })
})
