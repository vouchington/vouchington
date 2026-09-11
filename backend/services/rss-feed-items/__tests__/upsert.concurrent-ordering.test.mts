import { describe, expect, it } from 'vitest'
import type { TransactionQuery } from '@data-stores/psql'
import {
  beginTransaction,
  listTestRssFeedItemCategorySnapshotReconciliations,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { getUrlById } from '@services/urls'
import { getRssFeedItemByCompositeKey } from '../get.mts'
import { upsertRssFeedItems } from '../upsert.mts'
import { prepareRssFeedItemsForUpsert } from '../upsert-prepare.mts'
import { upsertRssFeedItemIdentities } from '../upsert-identities.mts'
import { upsertRssFeedItemContent, upsertRssFeedItemSources } from '../upsert-queries.mts'
import {
  reconcileRssFeedItemCategorySnapshotRows,
  type RssFeedItemCategorySnapshotReconciliation,
} from '../category-snapshot-reconciliations.mts'
import { getRssFeedItemCategories } from '../categories.mts'

describe('RSS feed item concurrent upsert ordering', () => {
  it('dispatches reverse-order identity, content, and source writers on two PostgreSQL clients', async () => {
    const { firstFeed, secondFeed, items, urlHostnameId } = await createSharedFeedItems()
    const preparedItems = await prepareRssFeedItemsForUpsert(items)
    const firstDispatching = Promise.withResolvers<void>()
    const secondDispatching = Promise.withResolvers<void>()

    // The production boundary exposes one query per multi-row statement, so this barrier proves
    // real-client contention; the schema-aware static guard owns the statement ORDER BY contract.
    await expect(
      Promise.all([
        writeSharedItems(
          firstFeed.id,
          preparedItems,
          urlHostnameId,
          firstDispatching,
          secondDispatching,
        ),
        writeSharedItems(
          secondFeed.id,
          [...preparedItems].reverse(),
          urlHostnameId,
          secondDispatching,
          firstDispatching,
        ),
      ]),
    ).resolves.toHaveLength(2)

    for (const item of items) {
      const [firstSource, secondSource] = await Promise.all([
        getRssFeedItemByCompositeKey(firstFeed.id, item.guid),
        getRssFeedItemByCompositeKey(secondFeed.id, item.guid),
      ])
      expect(secondSource?.id).toBe(firstSource?.id)
    }
  })

  it('dispatches reverse-order content and source writes after identities already exist', async () => {
    const { firstFeed, items, urlHostnameId } = await createSharedFeedItems()
    const preparedItems = await prepareRssFeedItemsForUpsert(items)
    const identities = await insertIdentities(urlHostnameId, preparedItems)
    const firstContentDispatching = Promise.withResolvers<void>()
    const secondContentDispatching = Promise.withResolvers<void>()
    await expect(
      Promise.all([
        writeBarrieredContent(
          firstContentDispatching,
          secondContentDispatching,
          identities,
          preparedItems,
        ),
        writeBarrieredContent(
          secondContentDispatching,
          firstContentDispatching,
          identities,
          [...preparedItems].reverse(),
        ),
      ]),
    ).resolves.toHaveLength(2)

    const firstSourceDispatching = Promise.withResolvers<void>()
    const secondSourceDispatching = Promise.withResolvers<void>()
    await expect(
      Promise.all([
        writeBarrieredSources(
          firstSourceDispatching,
          secondSourceDispatching,
          firstFeed.id,
          identities,
        ),
        writeBarrieredSources(
          secondSourceDispatching,
          firstSourceDispatching,
          firstFeed.id,
          [...identities].reverse(),
        ),
      ]),
    ).resolves.toHaveLength(2)
  })

  it('persists reverse-order shared batches from feeds on one hostname', async () => {
    const { firstFeed, secondFeed, items } = await createSharedFeedItems()
    const firstDispatching = Promise.withResolvers<void>()
    const secondDispatching = Promise.withResolvers<void>()

    const first = (async () => {
      firstDispatching.resolve()
      await secondDispatching.promise
      return upsertRssFeedItems(firstFeed.id, items)
    })()
    const second = (async () => {
      secondDispatching.resolve()
      await firstDispatching.promise
      return upsertRssFeedItems(secondFeed.id, [...items].reverse())
    })()

    const [firstResults, secondResults] = await Promise.all([first, second])
    const expectedFirstOrder = await Promise.all(
      items.map(item => getRssFeedItemByCompositeKey(firstFeed.id, item.guid)),
    )
    await reconcileOwned(expectedFirstOrder.map(item => item!.id))
    for (const item of items) {
      const [firstSource, secondSource] = await Promise.all([
        getRssFeedItemByCompositeKey(firstFeed.id, item.guid),
        getRssFeedItemByCompositeKey(secondFeed.id, item.guid),
      ])
      expect(firstSource?.id).toBeDefined()
      expect(secondSource?.id).toBe(firstSource?.id)
      expect(firstSource?.data.title).toBe(item.title)
      expect(secondSource?.data.title).toBe(item.title)
      await expect(getRssFeedItemCategories(firstSource!.id)).resolves.toEqual([
        expect.objectContaining({ category_text: item.categories![0] }),
      ])
    }
    // Whichever side actually observes unwritten content wins the identity/content write and
    // returns the changed rows in its own caller-visible order; the loser reads back content the
    // winner already committed and correctly returns [] without re-touching it. Which side wins is
    // a genuine DB-timing race, and the winner's write is a single transaction, so each side's
    // result is either empty or the full set - never a partial write.
    const canonicalOrderIds = expectedFirstOrder.map(item => item?.id)
    const writers = [
      { ids: firstResults.map(result => result.id), expected: canonicalOrderIds },
      { ids: secondResults.map(result => result.id), expected: [...canonicalOrderIds].reverse() },
    ].filter(writer => writer.ids.length > 0)
    expect(writers.length).toBeGreaterThan(0)
    expect(writers.every(writer => writer.ids.length === canonicalOrderIds.length)).toBe(true)
    expect(writers.map(writer => writer.ids)).toEqual(writers.map(writer => writer.expected))
  })
})

async function writeSharedItems(
  rssFeedId: string,
  items: Awaited<ReturnType<typeof prepareRssFeedItemsForUpsert>>,
  urlHostnameId: string,
  dispatching: PromiseWithResolvers<void>,
  peerDispatching: PromiseWithResolvers<void>,
): Promise<void> {
  await using transaction = await beginTransaction()
  const barrieredQuery = createBarrieredQuery(transaction, dispatching, peerDispatching)
  const identities = await upsertRssFeedItemIdentities(barrieredQuery, urlHostnameId, items)
  const content = await upsertRssFeedItemContent(transaction, identities, items)
  await upsertRssFeedItemSources(transaction, rssFeedId, content)
  await transaction.commit()
}

async function insertIdentities(
  urlHostnameId: string,
  items: Awaited<ReturnType<typeof prepareRssFeedItemsForUpsert>>,
) {
  await using transaction = await beginTransaction()
  const identities = await upsertRssFeedItemIdentities(transaction, urlHostnameId, items)
  await transaction.commit()
  return identities
}

async function writeBarrieredContent(
  dispatching: PromiseWithResolvers<void>,
  peerDispatching: PromiseWithResolvers<void>,
  identities: Awaited<ReturnType<typeof upsertRssFeedItemIdentities>>,
  items: Awaited<ReturnType<typeof prepareRssFeedItemsForUpsert>>,
) {
  await using transaction = await beginTransaction()
  const barrieredQuery = createBarrieredQuery(transaction, dispatching, peerDispatching)
  const content = await upsertRssFeedItemContent(barrieredQuery, identities, items)
  await transaction.commit()
  return content
}

async function writeBarrieredSources(
  dispatching: PromiseWithResolvers<void>,
  peerDispatching: PromiseWithResolvers<void>,
  rssFeedId: string,
  identities: Awaited<ReturnType<typeof upsertRssFeedItemIdentities>>,
) {
  await using transaction = await beginTransaction()
  const barrieredQuery = createBarrieredQuery(transaction, dispatching, peerDispatching)
  const sources = await upsertRssFeedItemSources(barrieredQuery, rssFeedId, identities)
  await transaction.commit()
  return sources
}

function createBarrieredQuery(
  query: TransactionQuery,
  dispatching: PromiseWithResolvers<void>,
  peerDispatching: PromiseWithResolvers<void>,
): TransactionQuery {
  return Object.assign(
    async (input: string, values?: unknown[]) => {
      dispatching.resolve()
      await peerDispatching.promise
      return query(input, values)
    },
    { client: query.client },
  ) as TransactionQuery
}

async function reconcileOwned(rssFeedItemIds: string[]): Promise<void> {
  const rows = await listTestRssFeedItemCategorySnapshotReconciliations(rssFeedItemIds)
  await reconcileRssFeedItemCategorySnapshotRows(
    rows as RssFeedItemCategorySnapshotReconciliation[],
  )
}

async function createSharedFeedItems() {
  const suffix = Math.random().toString(36).slice(2, 15)
  const hostname = `rss-upsert-order-${suffix}.example.com`
  const [firstFeed, secondFeed] = await Promise.all([
    insertTestRssFeedDirect({
      rssFeedUrl: `https://${hostname}/first.xml`,
      topicHostname: `rss-upsert-first-${suffix}`,
    }),
    insertTestRssFeedDirect({
      rssFeedUrl: `https://${hostname}/second.xml`,
      topicHostname: `rss-upsert-second-${suffix}`,
    }),
  ])
  const feedUrl = await getUrlById(firstFeed.rss_feed_url_id)
  if (!feedUrl) throw new Error('Test RSS feed URL not found')
  return {
    firstFeed,
    secondFeed,
    urlHostnameId: feedUrl.hostname.id,
    items: [
      {
        link: `https://${hostname}/first-item`,
        guid: `rss-upsert-first-${suffix}`,
        title: 'First shared item',
        categories: [`#first-${suffix}`],
      },
      {
        link: `https://${hostname}/second-item`,
        guid: `rss-upsert-second-${suffix}`,
        title: 'Second shared item',
        categories: [`#second-${suffix}`],
      },
    ],
  }
}
