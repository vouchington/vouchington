import { it, expect, describe } from 'vitest'
import { setCanonicalRssFeed, CircularRssFeedCanonicalError } from './set-canonical.mts'
import { createRssFeed } from './create.mts'
import { updateRssFeedById } from './update.mts'
import { getRssFeedById } from './get.mts'
import { createTestTopic, WEB_PROVENANCE } from '@voucha/test-helpers'

describe('set-canonical', () => {
  async function makeFeed(suffix: string) {
    const random = Math.random().toString(36).slice(2, 12)
    const topic = await createTestTopic({
      name: `Set Canonical ${suffix} ${random}`,
      slug: `set-canonical-${suffix}-${random}`,
      hostname: `set-canonical-${suffix}-${random}.example.com`,
    })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://set-canonical-${suffix}-${random}.example.com/feed.xml`,
      topic_id: topic.id,
      title: `Set Canonical Feed ${suffix} ${random}`,
    })
    await updateRssFeedById(feed.id, { enabled: true })
    return feed
  }

  it('setCanonicalRssFeed sets canonical_rss_feed_id', async () => {
    const source = await makeFeed('basic-src')
    const canonical = await makeFeed('basic-can')

    await setCanonicalRssFeed(source.id, canonical.id)

    const updatedFeed = await getRssFeedById(source.id)
    expect(updatedFeed?.canonical_rss_feed_id).toBe(canonical.id)
  })

  it('setCanonicalRssFeed throws on self-canonical', async () => {
    const feed = await makeFeed('self')
    await expect(setCanonicalRssFeed(feed.id, feed.id)).rejects.toThrow(Error)
  })

  it('setCanonicalRssFeed throws CircularRssFeedCanonicalError on cycle', async () => {
    const a = await makeFeed('cycle-a')
    const b = await makeFeed('cycle-b')

    await setCanonicalRssFeed(a.id, b.id)

    await expect(setCanonicalRssFeed(b.id, a.id)).rejects.toBeInstanceOf(
      CircularRssFeedCanonicalError,
    )
  })

  it('setCanonicalRssFeed flattens chain: A→B then B→C flattens A to C', async () => {
    const a = await makeFeed('chain-a')
    const b = await makeFeed('chain-b')
    const c = await makeFeed('chain-c')

    await setCanonicalRssFeed(a.id, b.id)
    await setCanonicalRssFeed(b.id, c.id)

    // After b→c is set, a should be flattened to c
    const updatedFeedA = await getRssFeedById(a.id)
    expect(updatedFeedA?.canonical_rss_feed_id).toBe(c.id)
  })
})
