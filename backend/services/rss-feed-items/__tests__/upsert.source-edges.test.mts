import { describe, expect, it } from 'vitest'
import { upsertRssFeedItems } from '../upsert.mts'
import { insertTestRssFeedDirect } from '@voucha/test-helpers'
import { captureAddedPublicationEffectsForScope } from '@voucha/test-helpers/publication-effect-jobs'

describe('RSS feed item source upsert', () => {
  it('records source-change work only when an upsert adds a source edge', async () => {
    const feed = await insertTestRssFeedDirect({})
    const item = {
      guid: `source-edge-${crypto.randomUUID()}`,
      link: `https://example.com/source-edge-${crypto.randomUUID()}`,
      title: 'Before source replay',
    }
    const first = await captureAddedPublicationEffectsForScope(feed.id, () =>
      upsertRssFeedItems(feed.id, [item]),
    )
    expect(first.map(job => job.reason)).toContain('rss_feed_source_changed')

    const replay = await captureAddedPublicationEffectsForScope(feed.id, () =>
      upsertRssFeedItems(feed.id, [{ ...item, title: 'Changed without a new source edge' }]),
    )
    expect(replay.map(job => job.reason)).not.toContain('rss_feed_source_changed')
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

    const jobs = await captureAddedPublicationEffectsForScope(secondFeed.id, () =>
      upsertRssFeedItems(secondFeed.id, [{ ...item, title: 'Shared source item corrected' }]),
    )
    expect(jobs.flatMap(job => job.keys)).toContainEqual({
      kind: 'impact_rss_feed_item',
      uuidValue: created.id,
    })
  })
})
