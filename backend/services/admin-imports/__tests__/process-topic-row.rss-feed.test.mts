import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { getRssFeedByTopicId } from '@services/rss-feeds/get'
import { createImportBatch } from '../create-batch.mts'
import { processTopicRow } from '../process-topic-row.mts'
import { getTopicByAny } from '@services/topics/get'
import type { PrivateUser } from '@services/users/types'
import type { ImportRow } from '../types.mts'

describe('process-topic-row (rss-feed)', () => {
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

  it('uses bare title on re-import when topic_type and rss_feed_url are omitted from CSV', async () => {
    const suffix = randomSuffix()
    const parentSlug = `parent-reimport-${suffix}`
    const feedSlug = `reimport-feed-${suffix}`
    const feedUrl = `https://reimport-test-${suffix}.example.com/feed.xml`

    const parentRow = await makeRow(admin, { slug: parentSlug, name: `Reimport Org ${suffix}` })
    await processTopicRow(admin, parentRow)

    // First import with topic_type=rss_feed
    const row1 = await makeRow(admin, {
      slug: feedSlug,
      name: `Reimport Feed ${suffix}`,
      topic_type: 'rss_feed',
      rss_feed_url: feedUrl,
      rss_feed_title: `Reimport Feed ${suffix}`,
      parent_slugs: parentSlug,
    })
    await processTopicRow(admin, row1)

    // Second import omitting topic_type (and rss_feed_url/rss_feed_title — those require
    // topic_type=rss_feed in the real CSV pipeline) — should still apply suffix from DB type
    const row2 = await makeRow(admin, {
      slug: feedSlug,
      name: `Reimport Feed Updated ${suffix}`,
      parent_slugs: parentSlug,
    })
    await processTopicRow(admin, row2)

    const topic = await getTopicByAny(feedSlug)
    expect(topic!.name).toBe(`Reimport Feed Updated ${suffix}`)
  })

  it('updates RSS feed on re-import with different title', async () => {
    const suffix = randomSuffix()
    const parentSlug = `parent-update-${suffix}`
    const slug = `rss-update-${suffix}`
    const feedUrl = `https://rss-update-test-${suffix}.example.com/feed.xml`

    // Create parent first
    const parentRow = await makeRow(admin, { slug: parentSlug, name: `Update Org ${suffix}` })
    await processTopicRow(admin, parentRow)

    // First import
    const row1 = await makeRow(admin, {
      slug,
      name: `RSS Update Feed ${suffix}`,
      topic_type: 'rss_feed',
      rss_feed_url: feedUrl,
      rss_feed_title: `Original Feed ${suffix}`,
      parent_slugs: parentSlug,
    })
    await processTopicRow(admin, row1)

    // Second import with different title
    const row2 = await makeRow(admin, {
      slug,
      name: `RSS Update Feed ${suffix}`,
      topic_type: 'rss_feed',
      rss_feed_url: feedUrl,
      rss_feed_title: `Updated Feed ${suffix}`,
      parent_slugs: parentSlug,
    })
    await processTopicRow(admin, row2)

    const topicId = (await getTopicByAny(slug))!.id
    const feed = await getRssFeedByTopicId(topicId)
    expect(feed!.title).toBe(`Updated Feed ${suffix}`)
  })

  it('soft-deletes an existing RSS feed when a seed row is retyped away from rss_feed', async () => {
    const suffix = randomSuffix()
    const parentSlug = `parent-retire-${suffix}`
    const slug = `rss-retire-${suffix}`
    const feedUrl = `https://rss-retire-test-${suffix}.example.com/feed.xml`

    const parentRow = await makeRow(admin, { slug: parentSlug, name: `Retire Org ${suffix}` })
    await processTopicRow(admin, parentRow)

    const feedRow = await makeRow(admin, {
      slug,
      name: `RSS Retire Feed ${suffix}`,
      topic_type: 'rss_feed',
      rss_feed_url: feedUrl,
      rss_feed_title: `RSS Retire Feed ${suffix}`,
      parent_slugs: parentSlug,
    })
    const topicId = await processTopicRow(admin, feedRow)

    expect(await getRssFeedByTopicId(topicId)).not.toBeNull()

    const retypedRow = await makeRow(admin, {
      slug,
      name: `RSS Retire Org ${suffix}`,
      topic_type: 'topic',
      parent_slugs: parentSlug,
    })
    await processTopicRow(admin, retypedRow)

    const topic = await getTopicByAny(topicId)
    expect(topic!.topic_type).toBe('topic')
    expect(await getRssFeedByTopicId(topicId)).toBeNull()
  })
})
