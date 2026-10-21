import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestPost,
  createTestTopic,
  createTestRssFeedItemWithUrl,
  insertTestCommunity,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import {
  sdkCatalogCases,
  connectSdkCatalog,
  createSdkCatalogAssertions,
} from '@voucha/test-helpers/mcp-sdk-catalog'
import { sdkMergedSuccessNames } from '@voucha/test-helpers/mcp-sdk-success-names'

describe('registered participation write catalog SDK', () => {
  it('executes all participation merged tools and validates their advertised output contracts', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const community = await insertTestCommunity({ createdById: (await createTestUser()).id })
    const feedUrl = `http://sdk-${crypto.randomUUID()}.example.com/feed.xml`
    const feed = await createTestRssFeed({ rssFeedUrl: feedUrl })
    const item = await createTestRssFeedItemWithUrl(feed.id)
    const client = await connectSdkCatalog(sdkCatalogCases[0], user, async (url, fetch) => {
      const sdk = new Client({ name: 'voucha-participation-catalog-test', version: '1.0.0' })
      await sdk.connect(new StreamableHTTPClientTransport(url, { fetch }))
      return sdk
    })
    const post = await createTestPost({ user, privacy: 'public' })
    const names = new Set<string>()
    try {
      const catalog = await createSdkCatalogAssertions(client)
      for (const [name, option, args] of [
        ['act_on_post', 'unread', { id: post.id }],
        ['participate_in_community', 'join', { community_id: community.id }],
        ['vote', 'set_topic', { id: topic.id, choice: 'like' }],
        ['set_rss_feed_item_read', 'read', { rss_feed_item_id: item.id }],
        ['share_rss_feed_item', 'share', { rss_feed_item_id: item.id }],
        ['submit_rss_feed', 'submit', { rss_feed_url: feedUrl, follow: false }],
        [
          'start_discussion',
          'rss_feed_item',
          { rss_feed_item_id: item.id, idempotency_key: crypto.randomUUID() },
        ],
      ] as const) {
        await catalog.callAndValidate(name, option, args)
        names.add(name)
      }
      expect([...names].toSorted()).toEqual(
        [...sdkMergedSuccessNames.participationFixture].toSorted(),
      )
    } finally {
      await client.close()
    }
  })
})
