import { it, expect, describe, vi } from 'vitest'
import { createRssFeed } from '../create.mts'
import { getRssFeedById } from '../get.mts'
import { beginTransaction, createTestTopic, createTestUser } from '@voucha/test-helpers'
import { lockTopicRssFeedAttachmentLifecycle } from '@services/post-publication/lock'
import { getTopicByAny } from '@services/topics/get'
import { mergeTopicAliases } from '@services/topics/merge-aliases'

describe('create.generated', () => {
  it('createRssFeed creates a feed with valid URLs and topic', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `example-${random}.com` })

    const feed = await createRssFeed({
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
        rss_feed_url: 'https://localhost/feed.xml',
        topic_id: topic.id,
        title: 'Test Feed',
      }),
    ).rejects.toThrow('rss_feed_url must be a valid URL')
  })

  it('createRssFeed throws error for invalid topic_id', async () => {
    await expect(
      createRssFeed({
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

  it('takes the topic attachment lifecycle before waiting on the topic row', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `attachment-create-${random}.example.com` })
    const topicRowLocked = Promise.withResolvers<void>()
    const releaseTopicRow = Promise.withResolvers<void>()
    async function holdTopicRow(): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* createRssFeed attachment lifecycle test */ SELECT 1 FROM topics WHERE id = $1::uuid FOR UPDATE`,
        [topic.id],
      )
      topicRowLocked.resolve()
      await releaseTopicRow.promise
      await query.commit()
    }
    const holder = holdTopicRow()
    await topicRowLocked.promise

    const creating = createRssFeed({
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/attachment-create-${random}.xml`,
      topic_id: topic.id,
      title: `Attachment lifecycle ${random}`,
    })
    try {
      await vi.waitFor(async () => {
        await expect(contendForTopicAttachmentLifecycle()).rejects.toMatchObject({ code: '55P03' })
      })
    } finally {
      releaseTopicRow.resolve()
    }
    await holder
    await creating

    async function contendForTopicAttachmentLifecycle(): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* createRssFeed attachment lifecycle timeout */ SET LOCAL lock_timeout = '50ms'`,
      )
      await lockTopicRssFeedAttachmentLifecycle(query, topic.id)
      await query.commit()
    }
  })

  it('rejects an attachment that waits for its topic to merge', async () => {
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
    const destinationRowLocked = Promise.withResolvers<void>()
    const releaseDestinationRow = Promise.withResolvers<void>()
    async function holdDestinationTopicRow(): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* createRssFeed merge destination lock test */
        SELECT 1 FROM topics WHERE id = $1::uuid FOR UPDATE`,
        [destination.id],
      )
      destinationRowLocked.resolve()
      await releaseDestinationRow.promise
      await query.commit()
    }
    const destinationHolder = holdDestinationTopicRow()
    await destinationRowLocked.promise

    const merging = mergeTopicAliases(user, sourceTopic, destinationTopic)
    await vi.waitFor(async () => {
      await expect(contendForSourceAttachmentLifecycle()).rejects.toMatchObject({ code: '55P03' })
    })
    const creating = createRssFeed({
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/attachment-merge-${crypto.randomUUID()}.xml`,
      topic_id: source.id,
      title: 'Attachment after merge',
    })
    const creationOutcome = creating.then(
      () => undefined,
      (error: unknown) => error,
    )
    try {
      releaseDestinationRow.resolve()
      await merging
      await expect(creationOutcome).resolves.toMatchObject({
        status: 422,
        message: 'Topic not found',
      })
    } finally {
      releaseDestinationRow.resolve()
      await destinationHolder
      await merging.catch(() => undefined)
      await creationOutcome
    }

    async function contendForSourceAttachmentLifecycle(): Promise<void> {
      await using query = await beginTransaction()
      await query(
        `/* createRssFeed merged attachment lifecycle timeout */ SET LOCAL lock_timeout = '50ms'`,
      )
      await lockTopicRssFeedAttachmentLifecycle(query, source.id)
      await query.commit()
    }
  })
})
