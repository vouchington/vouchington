import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  insertTestRssFeedDirect,
  getTestRssFeedUrlHostnameId,
} from '@voucha/test-helpers'
import { countTestRssFeedItemSources } from '@voucha/test-helpers/entities/rss-feed-items'
import { softDeleteTestRssFeedItem } from '@voucha/test-helpers/entities/url-ranking'
import { createTestPostgresLockWaiter } from '@voucha/test-helpers/postgres-lock-waiter'
import {
  deleteTestRssFeedRow,
  markReferencedTestRssFeedForDeletion,
} from '../../../test-helpers/rss-hard-delete-queries.mts'
import { hardDeleteRssFeedSourcePage } from '../../rss-feeds/hard-delete-source-page.mts'
import { upsertRssFeedItems } from '../upsert.mts'
import { prepareRssFeedItemsForUpsert } from '../upsert-prepare.mts'
import { upsertRssFeedItemIdentities } from '../upsert-identities.mts'
import { upsertRssFeedItemContent, upsertRssFeedItemSources } from '../upsert-queries.mts'

describe('RSS feed item upsert without advisory locks', () => {
  it('gives two concurrent transactions one identity for the same GUID', async () => {
    const suffix = crypto.randomUUID()
    const feed = await insertTestRssFeedDirect({})
    const urlHostnameId = await getTestRssFeedUrlHostnameId(feed.id)
    const guid = `lock-free-identity-${suffix}`
    const items = await prepareRssFeedItemsForUpsert([
      { guid, link: `https://lock-free-identity-${suffix}.example.com/a`, title: 'Identity' },
    ])
    await using holder = await beginTransaction()
    const held = await upsertRssFeedItemIdentities(holder, urlHostnameId, items)
    await using waiter = await createTestPostgresLockWaiter({
      holder,
      lock: { kind: 'transaction' },
      selected: {
        marker: '/* upsertRssFeedItems:identities */',
        binding: { index: 1, value: [guid] },
      },
    })
    // The contender's insert conflicts with the holder's uncommitted identity and waits for it.
    const contender = upsertRssFeedItemIdentities(waiter.query, urlHostnameId, items)
    await waiter.waitForLock(contender)
    await holder.commit()
    const resolved = await contender
    await waiter.query.commit()

    expect(held).toHaveLength(1)
    expect(resolved).toEqual(held)
  })

  it('reports the replaced URL only when the write replaced an active row', async () => {
    const suffix = crypto.randomUUID()
    const feed = await insertTestRssFeedDirect({})
    const urlHostnameId = await getTestRssFeedUrlHostnameId(feed.id)
    const guid = `lock-free-previous-url-${suffix}`
    const input = {
      guid,
      link: `https://lock-free-previous-url-${suffix}.example.com/a`,
      title: 'Previous URL',
    }
    const write = async (link: string) => {
      const items = await prepareRssFeedItemsForUpsert([{ ...input, link }])
      await using transaction = await beginTransaction()
      const identities = await upsertRssFeedItemIdentities(transaction, urlHostnameId, items)
      const rows = await upsertRssFeedItemContent(transaction, identities, items)
      await transaction.commit()
      return rows[0]!
    }

    const inserted = await write(input.link)
    const revised = await write(`${input.link}-revised`)
    await softDeleteTestRssFeedItem(inserted.id)
    const revived = await write(`${input.link}-revived`)

    expect(inserted.previous_url_id).toBeNull()
    expect(revised.previous_url_id).toBe(inserted.url_id)
    expect(revived.previous_url_id).toBeNull()
  })

  it('drains a source inserted after the hard-delete request by feed id', async () => {
    const suffix = crypto.randomUUID()
    const feed = await insertTestRssFeedDirect({})
    const otherFeed = await insertTestRssFeedDirect({})
    const [item] = await upsertRssFeedItems(otherFeed.id, [
      { guid: `lock-free-late-${suffix}`, link: `https://lock-free-late-${suffix}.example.com/a` },
    ])
    await markReferencedTestRssFeedForDeletion(feed.id)
    await using lateWriter = await beginTransaction()
    // An upsert that passed its active-feed check before the request still inserts its source.
    const lateRows = await upsertRssFeedItemSources(lateWriter, feed.id, [{ id: item!.id }])
    expect(lateRows).toEqual([{ rss_feed_item_id: item!.id }])
    await lateWriter.commit()

    await expect(hardDeleteRssFeedSourcePage(feed.id)).resolves.toMatchObject({ removed: 1 })
    expect(await countTestRssFeedItemSources(feed.id)).toBe(0)
    await deleteTestRssFeedRow(feed.id)
    await deleteTestRssFeedRow(otherFeed.id)
  })
})
