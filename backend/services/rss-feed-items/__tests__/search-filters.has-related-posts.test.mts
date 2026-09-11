import { it, expect, describe } from 'vitest'
import { createHash } from 'node:crypto'
import {
  createTestUser,
  insertTestTopic,
  insertTestRssFeed,
  insertTestRssFeedItem,
  insertTestPost,
  createTestUrlWithHostname,
} from '@voucha/test-helpers'
import { searchRssFeedItems } from '../search.mts'

describe('searchRssFeedItems has_related_posts', () => {
  it('includes item when a link post shares url_id with the rss feed item', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)

    const topicId = await insertTestTopic({
      name: `HRP Topic ${random}`,
      slug: `hrp-topic-${random}`,
      createdById: user!.id,
    })

    const feedId = await insertTestRssFeed({
      topicId,
      title: `HRP Feed ${random}`,
    })

    const urlId = await createTestUrlWithHostname()
    const contentSha256 = createHash('sha256').update(`hrp-${random}`).digest()

    const itemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `hrp-guid-${random}`,
      itemData: { title: `HRP Item ${random}` },
      contentSha256,
    })

    const slug = `hrp-link-post-${random}`
    await insertTestPost({
      title: `HRP Link Post ${random}`,
      slug,
      createdById: user!.id,
      markdown: '',
      postType: 'link',
      urlId,
    })

    const trueResult = await searchRssFeedItems({ has_related_posts: true })
    expect(trueResult.results.map(r => r.id)).toContain(itemId)

    const falseResult = await searchRssFeedItems({ has_related_posts: false })
    expect(falseResult.results.map(r => r.id)).not.toContain(itemId)
  })

  it('excludes item from has_related_posts=true when no related link post or relation exists', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)

    const topicId = await insertTestTopic({
      name: `HRP2 Topic ${random}`,
      slug: `hrp2-topic-${random}`,
      createdById: user!.id,
    })

    const feedId = await insertTestRssFeed({
      topicId,
      title: `HRP2 Feed ${random}`,
    })

    const urlId = await createTestUrlWithHostname()
    const contentSha256 = createHash('sha256').update(`hrp2-${random}`).digest()

    const itemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `hrp2-guid-${random}`,
      itemData: { title: `HRP2 Item ${random}` },
      contentSha256,
    })

    const trueResult = await searchRssFeedItems({ has_related_posts: true })
    expect(trueResult.results.map(r => r.id)).not.toContain(itemId)

    const falseResult = await searchRssFeedItems({ has_related_posts: false })
    expect(falseResult.results.map(r => r.id)).toContain(itemId)
  })
})
