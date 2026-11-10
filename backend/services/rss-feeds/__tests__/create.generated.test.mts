import { it, expect, describe } from 'vitest'
import { createRssFeed } from '../create.mts'
import { getRssFeedById } from '../get.mts'
import { createTestTopic, createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { getTopicByAny } from '@services/topics/get'
import { settleTopicMergeOperationForTest } from '@voucha/test-helpers/merge-topics'
import { createTopicMergeOperation } from '@services/topics/merge-operations'

describe('create.generated', () => {
  it('createRssFeed creates a feed with valid URLs and topic', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `example-${random}.com` })

    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-${random}.xml`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    expect(feed).toBeDefined()
    expect(feed.title).toBe(`Test Feed ${random}`)
    // createRssFeed returns raw table row, so topic_id is available directly
    expect(feed.topic_id).toBe(topic.id)
    expect(feed.rss_feed_url_id).toBeDefined()
  })

  it('createRssFeed throws error for invalid rss_feed_url', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `invalid-rss-${random}.example.com` })

    await expect(
      createRssFeed({
        provenance: WEB_PROVENANCE,
        rss_feed_url: 'not-a-url',
        topic_id: topic.id,
        title: 'Test Feed',
      }),
    ).rejects.toThrow('rss_feed_url must be a valid URL')
  })

  it('createRssFeed throws error for rss_feed_url fragments', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `fragment-rss-${random}.example.com` })

    await expect(
      createRssFeed({
        provenance: WEB_PROVENANCE,
        rss_feed_url: `https://example.com/feed-${random}.xml#section`,
        topic_id: topic.id,
        title: 'Test Feed',
      }),
    ).rejects.toThrow('rss_feed_url must be a valid URL')
  })

  it('createRssFeed throws error for non-public rss_feed_url hosts before remote validation', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `private-rss-${random}.example.com` })

    await expect(
      createRssFeed({
        provenance: WEB_PROVENANCE,
        rss_feed_url: 'https://localhost/feed.xml',
        topic_id: topic.id,
        title: 'Test Feed',
      }),
    ).rejects.toThrow('rss_feed_url must be a valid URL')
  })

  it('createRssFeed throws error for invalid topic_id', async () => {
    await expect(
      createRssFeed({
        provenance: WEB_PROVENANCE,
        rss_feed_url: 'https://example.com/feed.xml',
        topic_id: 'not-a-uuid',
        title: 'Test Feed',
      }),
    ).rejects.toThrow('topic_id must be a valid UUID')
  })

  it('createRssFeed succeeds without a title (title is optional)', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `missing-title-${random}.example.com` })

    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-notitle-${random}.xml`,
      topic_id: topic.id,
    })
    expect(feed).toBeDefined()
    expect(feed.title).toBeNull()
  })

  it('createRssFeed can be retrieved by id', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `retrieved-${random}.example.com` })

    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-${random}.xml`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    const retrieved = await getRssFeedById(feed.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(feed.id)
    expect(retrieved!.title).toBe(`Test Feed ${random}`)
  })

  it('rejects an attachment during merge reservation and after source redirect', async () => {
    const user = await createTestUser({ administrator: true })
    const source = await createTestTopic({
      user,
      hostname: `attachment-merge-source-${crypto.randomUUID()}.example.com`,
    })
    const destination = await createTestTopic({
      user,
      hostname: `attachment-merge-destination-${crypto.randomUUID()}.example.com`,
    })
    const [sourceTopic, destinationTopic] = await Promise.all([
      getTopicByAny(source.id),
      getTopicByAny(destination.id),
    ])
    if (!sourceTopic || !destinationTopic) throw new Error('Expected merge topics')
    const operation = await createTopicMergeOperation(user, sourceTopic, destinationTopic)
    const createSourceAttachment = () =>
      createRssFeed({
        provenance: WEB_PROVENANCE,
        skipRemoteValidation: true,
        rss_feed_url: `https://example.com/attachment-merge-${crypto.randomUUID()}.xml`,
        topic_id: source.id,
        title: 'Attachment during merge',
      })
    await expect(createSourceAttachment()).rejects.toMatchObject({
      code: 'topic_merge_in_progress',
    })
    await settleTopicMergeOperationForTest(user, source.id, operation.id)
    await expect(createSourceAttachment()).rejects.toMatchObject({
      status: 422,
      message: 'Topic not found',
    })
  })
})
