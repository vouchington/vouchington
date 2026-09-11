import { describe, expect, it } from 'vitest'
import { upsertRssFeedItems } from '../upsert.mts'
import {
  getTestPostPublicationDirtyWorkForScope,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import {
  claimPostPublicationDirtyWork,
  reconcilePostPublicationDirtyWork,
} from '@services/post-publication'

describe('RSS feed item source upsert', () => {
  it('records source-change work only when an upsert adds a source edge', async () => {
    const feed = await insertTestRssFeedDirect({})
    const item = {
      guid: `source-edge-${crypto.randomUUID()}`,
      link: `https://example.com/source-edge-${crypto.randomUUID()}`,
      title: 'Before source replay',
    }
    await upsertRssFeedItems(feed.id, [item])
    const before = await getTestPostPublicationDirtyWorkForScope({ type: 'rss_feed', id: feed.id })
    if (!before) throw new Error('Expected initial RSS source-change work')

    await upsertRssFeedItems(feed.id, [{ ...item, title: 'Changed without a new source edge' }])

    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'rss_feed', id: feed.id }),
    ).resolves.toMatchObject({ generation: before.generation })
  })

  it('retains the exact item when an existing item gains a feed source', async () => {
    const hostname = `source-edge-${crypto.randomUUID()}.example.com`
    const firstFeed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${hostname}/first.xml`,
      topicHostname: `first-${hostname}`,
    })
    const secondFeed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://${hostname}/second.xml`,
      topicHostname: `second-${hostname}`,
    })
    const item = {
      guid: `shared-source-edge-${crypto.randomUUID()}`,
      link: `https://${hostname}/shared-item`,
      title: 'Shared source item',
    }
    const [created] = await upsertRssFeedItems(firstFeed.id, [item])

    await upsertRssFeedItems(secondFeed.id, [{ ...item, title: 'Shared source item corrected' }])

    const work = await getTestPostPublicationDirtyWorkForScope({
      type: 'rss_feed',
      id: secondFeed.id,
    })
    if (!work) throw new Error('Expected RSS source-edge work')
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected RSS source-edge work lease')
    const result = await reconcilePostPublicationDirtyWork(claimed)
    expect(result.rssFeedItemIds).toEqual([created.id])
  })
})
