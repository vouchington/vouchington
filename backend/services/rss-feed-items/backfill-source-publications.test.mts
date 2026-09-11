import { describe, expect, it } from 'vitest'
import {
  clearRssFeedItemSourcePublicationsForTest,
  countRssFeedItemSourcePublicationsMissingForTest,
  getRssFeedItemSourcePublicationForTest,
  insertTestRssFeedDirect,
  observeTestPostgresQueryPools,
} from '@voucha/test-helpers'
import {
  RSS_FEED_ITEM_SOURCE_PUBLICATION_BACKFILL_MAX_BATCH_SIZE,
  backfillRssFeedItemSourcePublications,
  hasRssFeedItemSourcesMissingPublication,
} from './backfill-source-publications.mts'
import { upsertRssFeedItems } from './upsert.mts'

describe('RSS feed item source publications', () => {
  it.each([0, 1.5, Number.NaN, RSS_FEED_ITEM_SOURCE_PUBLICATION_BACKFILL_MAX_BATCH_SIZE + 1])(
    'rejects invalid backfill batch size %s before querying',
    async batchSize => {
      await expect(backfillRssFeedItemSourcePublications(batchSize)).rejects.toThrow(
        `batchSize must be an integer from 1 through ${RSS_FEED_ITEM_SOURCE_PUBLICATION_BACKFILL_MAX_BATCH_SIZE}`,
      )
    },
  )

  it('rejects an empty item scope before querying', async () => {
    await expect(backfillRssFeedItemSourcePublications(1, { rssFeedItemIds: [] })).rejects.toThrow(
      'rssFeedItemIds must not be empty',
    )
  })

  it.each([[['not-a-uuid']], [['00000000-0000-7000-8000-000000000000', 'not-a-uuid']]])(
    'rejects an item scope containing an invalid UUID before querying',
    async rssFeedItemIds => {
      await expect(backfillRssFeedItemSourcePublications(1, { rssFeedItemIds })).rejects.toThrow(
        'rssFeedItemIds must contain only valid UUIDs',
      )
    },
  )

  it.each(['', 'not-a-uuid'])('rejects invalid feed scope %s before querying', async rssFeedId => {
    await expect(backfillRssFeedItemSourcePublications(1, { rssFeedId })).rejects.toThrow(
      'rssFeedId must be a valid UUID',
    )
  })

  it('captures the UUID-clamped publication time for a future publisher date', async () => {
    const feed = await insertTestRssFeedDirect({})
    const suffix = crypto.randomUUID()
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        guid: suffix,
        isoDate: '2099-01-01T00:00:00.000Z',
        link: `https://example.com/rss-source-future-${suffix}`,
        title: 'Future-dated RSS item',
      },
    ])

    const source = await getRssFeedItemSourcePublicationForTest(feed.id, item.id)

    expect(source.source_published_at).toEqual(source.uuid_published_at)
    expect(source.item_published_at).toEqual(source.uuid_published_at)
  })

  it('keeps an older publisher date and never bumps an existing association', async () => {
    const feed = await insertTestRssFeedDirect({})
    const suffix = crypto.randomUUID()
    const item = {
      guid: suffix,
      isoDate: '2020-01-02T03:04:05.000Z',
      link: `https://example.com/rss-source-immutable-${suffix}`,
      title: 'Original RSS item',
    }
    const [created] = await upsertRssFeedItems(feed.id, [item])

    expect(
      (await getRssFeedItemSourcePublicationForTest(feed.id, created.id)).source_published_at,
    ).toEqual(new Date(item.isoDate))

    await upsertRssFeedItems(feed.id, [
      { ...item, isoDate: '2025-01-02T03:04:05.000Z', title: 'Revised RSS item' },
    ])
    const source = await getRssFeedItemSourcePublicationForTest(feed.id, created.id)

    expect(source.item_published_at).toEqual(new Date('2025-01-02T03:04:05.000Z'))
    expect(source.source_published_at).toEqual(new Date(item.isoDate))
  })

  it('copies the database publication timestamp without truncating microseconds', async () => {
    const feed = await insertTestRssFeedDirect({})
    const suffix = crypto.randomUUID()
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        guid: suffix,
        isoDate: '2020-01-02T03:04:05.123456Z',
        link: `https://example.com/rss-source-precision-${suffix}`,
        title: 'Microsecond RSS item',
      },
    ])

    const source = await getRssFeedItemSourcePublicationForTest(feed.id, item.id)

    expect(source.item_published_at_text).toBe('2020-01-02T03:04:05.123456Z')
    expect(source.source_published_at_text).toBe(source.item_published_at_text)
  })

  it('backfills legacy rows in bounded locked batches', async () => {
    const feed = await insertTestRssFeedDirect({})
    const suffix = crypto.randomUUID()
    const items = await upsertRssFeedItems(
      feed.id,
      ['2020-01-02T03:04:05.000Z', '2021-01-02T03:04:05.000Z'].map((isoDate, index) => ({
        guid: `${suffix}-${index}`,
        isoDate,
        link: `https://example.com/rss-source-backfill-${suffix}-${index}`,
        title: `Backfill RSS item ${index}`,
      })),
    )
    await clearRssFeedItemSourcePublicationsForTest(
      feed.id,
      items.map(item => item.id),
    )
    const scope = { rssFeedId: feed.id, rssFeedItemIds: items.map(item => item.id) }

    expect(
      await countRssFeedItemSourcePublicationsMissingForTest(feed.id, scope.rssFeedItemIds),
    ).toBe(BigInt(items.length))
    const missingPublicationQuery = await observeTestPostgresQueryPools(
      '/* hasRssFeedItemSourcesMissingPublication */',
      () => hasRssFeedItemSourcesMissingPublication(scope),
    )
    expect(missingPublicationQuery).toEqual({ pools: ['write'], result: true })
    expect(await backfillRssFeedItemSourcePublications(1, scope)).toBe(1)
    expect(
      await countRssFeedItemSourcePublicationsMissingForTest(feed.id, scope.rssFeedItemIds),
    ).toBe(1n)
    expect(await backfillRssFeedItemSourcePublications(10, scope)).toBe(1)
    expect(
      await countRssFeedItemSourcePublicationsMissingForTest(feed.id, scope.rssFeedItemIds),
    ).toBe(0n)
    expect(await hasRssFeedItemSourcesMissingPublication(scope)).toBe(false)

    await expect(
      Promise.all(items.map(item => getRssFeedItemSourcePublicationForTest(feed.id, item.id))),
    ).resolves.toEqual(
      expect.arrayContaining(
        ['2020-01-02T03:04:05.000Z', '2021-01-02T03:04:05.000Z'].map(isoDate =>
          expect.objectContaining({ source_published_at: new Date(isoDate) }),
        ),
      ),
    )
  })
})
