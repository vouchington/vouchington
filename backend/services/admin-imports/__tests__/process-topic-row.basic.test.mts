import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { getUrlHostnameById } from '@services/urls-hostnames/get'
import { getRssFeedByTopicId } from '@services/rss-feeds/get'
import { createImportBatch } from '../create-batch.mts'
import { processTopicRow } from '../process-topic-row.mts'
import { getTopicByAny } from '@services/topics/get'
import type { PrivateUser } from '@services/users/types'
import type { ImportRow } from '../types.mts'

describe('process-topic-row (basic)', () => {
  const randomSuffix = () => Math.random().toString(36).slice(2, 10)

  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  async function makeRow(
    creator: PrivateUser,
    inputData: Record<string, string>,
  ): Promise<ImportRow> {
    const { rows } = await createImportBatch(creator, 'topic', [inputData] as Record<
      string,
      unknown
    >[])
    return rows[0]
  }

  it('creates a new topic and returns its ID', async () => {
    const suffix = randomSuffix()
    const row = await makeRow(admin, {
      slug: `process-new-${suffix}`,
      name: `Process New ${suffix}`,
    })

    const topicId = await processTopicRow(admin, row)

    expect(topicId).toBeTruthy()
    const topic = await getTopicByAny(topicId)
    expect(topic).not.toBeNull()
    expect(topic!.slug).toBe(`process-new-${suffix}`)
    expect(topic!.name).toBe(`Process New ${suffix}`)
  })

  it('defaults name to slug when name not provided on create', async () => {
    const suffix = randomSuffix()
    const row = await makeRow(admin, { slug: `no-name-${suffix}` })

    const topicId = await processTopicRow(admin, row)

    const topic = await getTopicByAny(topicId)
    expect(topic!.name).toBe(`no-name-${suffix}`)
  })

  it('updates existing topic on re-import (upsert)', async () => {
    const suffix = randomSuffix()
    const slug = `upsert-topic-${suffix}`
    await insertTestTopic({ name: `Original Name ${suffix}`, slug, createdById: admin.id })

    const row = await makeRow(admin, { slug, name: `Updated Name ${suffix}` })
    const topicId = await processTopicRow(admin, row)

    const topic = await getTopicByAny(topicId)
    expect(topic!.name).toBe(`Updated Name ${suffix}`)
    expect(topic!.slug).toBe(slug)
  })

  it('only updates non-empty fields on upsert', async () => {
    const suffix = randomSuffix()
    const slug = `partial-upsert-${suffix}`
    await insertTestTopic({
      name: `Keep This Name ${suffix}`,
      slug,
      createdById: admin.id,
    })

    // Import with empty name (should not overwrite)
    const row = await makeRow(admin, { slug, name: '', topic_type: 'card' })
    await processTopicRow(admin, row)

    const topic = await getTopicByAny(slug)
    expect(topic!.name).toBe(`Keep This Name ${suffix}`)
    expect(topic!.topic_type).toBe('card')
  })

  it('appends feed URL to rss_feed topic name', async () => {
    const suffix = randomSuffix()
    const parentSlug = `parent-org-${suffix}`
    const feedSlug = `test-feed-${suffix}`
    const feedUrl = `https://rss-feed-suffix-test-${suffix}.example.com/feed.xml`

    // Create the parent topic first
    const parentRow = await makeRow(admin, { slug: parentSlug, name: `Parent Org ${suffix}` })
    await processTopicRow(admin, parentRow)

    const row = await makeRow(admin, {
      slug: feedSlug,
      name: `Test Feed ${suffix}`,
      topic_type: 'rss_feed',
      rss_feed_url: feedUrl,
      rss_feed_title: `Test Feed ${suffix}`,
      parent_slugs: parentSlug,
      feed_type: 'article',
    })
    const topicId = await processTopicRow(admin, row)

    const topic = await getTopicByAny(topicId)
    expect(topic!.name).toBe(`Test Feed ${suffix} (${feedUrl})`)
    expect(topic!.topic_type).toBe('rss_feed')
    expect(topic!.hostname_id).not.toBeNull()
    const hostname = await getUrlHostnameById(topic!.hostname_id!)
    expect(hostname!.topic_id).toBeNull()

    const feed = await getRssFeedByTopicId(topicId)
    expect(feed).not.toBeNull()
    expect(feed!.title).toBe(`Test Feed ${suffix}`)
  })

  it('appends feed URL to rss_feed topic name regardless of feed_type', async () => {
    const suffix = randomSuffix()
    const parentSlug = `parent-podcast-${suffix}`
    const feedSlug = `podcast-feed-${suffix}`
    const feedUrl = `https://podcast-test-${suffix}.example.com/feed.xml`

    const parentRow = await makeRow(admin, { slug: parentSlug, name: `Podcast Org ${suffix}` })
    await processTopicRow(admin, parentRow)

    const row = await makeRow(admin, {
      slug: feedSlug,
      name: `Test Podcast ${suffix}`,
      topic_type: 'rss_feed',
      rss_feed_url: feedUrl,
      rss_feed_title: `Test Podcast ${suffix}`,
      parent_slugs: parentSlug,
      feed_type: 'podcast',
    })
    const topicId = await processTopicRow(admin, row)

    const topic = await getTopicByAny(topicId)
    expect(topic!.name).toBe(`Test Podcast ${suffix} (${feedUrl})`)
  })

  it('appends feed URL to rss_feed topic name when feed_type is omitted', async () => {
    const suffix = randomSuffix()
    const parentSlug = `parent-default-${suffix}`
    const feedSlug = `default-feed-${suffix}`
    const feedUrl = `https://default-feed-test-${suffix}.example.com/feed.xml`

    const parentRow = await makeRow(admin, { slug: parentSlug, name: `Default Org ${suffix}` })
    await processTopicRow(admin, parentRow)

    const row = await makeRow(admin, {
      slug: feedSlug,
      name: `Default Feed ${suffix}`,
      topic_type: 'rss_feed',
      rss_feed_url: feedUrl,
      rss_feed_title: `Default Feed ${suffix}`,
      parent_slugs: parentSlug,
      // no feed_type
    })
    const topicId = await processTopicRow(admin, row)

    const topic = await getTopicByAny(topicId)
    expect(topic!.name).toBe(`Default Feed ${suffix} (${feedUrl})`)
  })

  it('does not suffix non-rss_feed topics', async () => {
    const suffix = randomSuffix()
    const slug = `plain-topic-${suffix}`
    const row = await makeRow(admin, {
      slug,
      name: `Plain Topic ${suffix}`,
      topic_type: 'topic',
    })
    const topicId = await processTopicRow(admin, row)

    const topic = await getTopicByAny(topicId)
    expect(topic!.name).toBe(`Plain Topic ${suffix}`)
  })

  it('is idempotent (same row twice produces same result)', async () => {
    const suffix = randomSuffix()
    const row = await makeRow(admin, {
      slug: `idempotent-process-${suffix}`,
      name: `Idempotent ${suffix}`,
    })

    const topicId1 = await processTopicRow(admin, row)
    const topicId2 = await processTopicRow(admin, row)

    expect(topicId1).toBe(topicId2)
  })
})
