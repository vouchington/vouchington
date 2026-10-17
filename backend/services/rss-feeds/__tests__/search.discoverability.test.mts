import { describe, expect, it } from 'vitest'
import { createRandomString, createTestTopic, WEB_PROVENANCE } from '@voucha/test-helpers'
import { createRssFeed } from '../create.mts'
import { searchRssFeeds } from '../search.mts'
import { updateRssFeedById } from '../update.mts'

describe('searchRssFeeds discoverability', () => {
  it('returns only undiscoverable feeds when discoverable=false', async () => {
    const random = createRandomString(10)
    const hiddenTopic = await createTestTopic({ hostname: `hidden-only-${random}.example.com` })
    const visibleTopic = await createTestTopic({ hostname: `visible-only-${random}.example.com` })
    const hiddenFeed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/hidden-${random}.xml`,
      topic_id: hiddenTopic.id,
      title: `Hidden Feed ${random}`,
    })
    const visibleFeed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/visible-${random}.xml`,
      topic_id: visibleTopic.id,
      title: `Visible Feed ${random}`,
    })
    await updateRssFeedById(hiddenFeed.id, { is_enabled: true, discoverable: false })
    await updateRssFeedById(visibleFeed.id, { is_enabled: true, discoverable: true })

    const hiddenResults = await searchRssFeeds({
      topic_id: hiddenTopic.id,
      discoverable: false,
    })
    expect(hiddenResults.map(feed => feed.id)).toContain(hiddenFeed.id)

    const visibleTopicResults = await searchRssFeeds({
      topic_id: visibleTopic.id,
      discoverable: false,
    })
    expect(visibleTopicResults.map(feed => feed.id)).not.toContain(visibleFeed.id)
  })
})
