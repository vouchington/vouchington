import { it, expect, vi, describe } from 'vitest'
import { createTestTopic, WEB_PROVENANCE } from '@voucha/test-helpers'

import { createRssFeed } from '../create.mts'
import { buildSourceTopicName } from '../validate.mts'
import { getRssFeedById } from '../get.mts'

describe('buildSourceTopicName', () => {
  it('omits leading space when feedUrl length exceeds 255-char limit', () => {
    const longUrl = `https://${'a'.repeat(260)}.example.com/feed`
    const result = buildSourceTopicName('My Feed', longUrl)
    expect(result.startsWith('(')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(255)
  })
})

describe('create.validate', () => {
  it('createRssFeed calls the feed URL validator by default', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `create-validate-${random}.example.com` })
    const assertRssFeedUrlExistsImpl = vi
      .fn<(...args: any[]) => Promise<any>>()
      .mockResolvedValue(undefined)
    await createRssFeed({
      provenance: WEB_PROVENANCE,
      rss_feed_url: `https://validate-${random}.example.com/feed.xml`,
      topic_id: topic.id,
      title: `Validate Test ${random}`,
      assertRssFeedUrlExistsImpl,
    })

    expect(assertRssFeedUrlExistsImpl).toHaveBeenCalledTimes(1)
    expect(assertRssFeedUrlExistsImpl).toHaveBeenCalledWith(
      `https://validate-${random}.example.com/feed.xml`,
    )
  })

  it('createRssFeed 422s when assertRssFeedUrlExists throws', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `create-validate-fail-${random}.example.com` })
    const err = Object.assign(
      new Error('RSS feed URL must return a valid RSS, Atom, or JSON feed'),
      {
        status: 422,
        statusCode: 422,
      },
    )
    const assertRssFeedUrlExistsImpl = vi
      .fn<(...args: any[]) => Promise<any>>()
      .mockRejectedValueOnce(err)

    await expect(
      createRssFeed({
        provenance: WEB_PROVENANCE,
        rss_feed_url: `https://validate-fail-${random}.example.com/feed.xml`,
        topic_id: topic.id,
        title: `Validate Fail ${random}`,
        assertRssFeedUrlExistsImpl,
      }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('createRssFeed skips assertRssFeedUrlExists when skipRemoteValidation is true', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({ hostname: `create-no-validate-${random}.example.com` })
    const assertRssFeedUrlExistsImpl = vi
      .fn<(...args: any[]) => Promise<any>>()
      .mockResolvedValue(undefined)
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://no-validate-${random}.example.com/feed.xml`,
      topic_id: topic.id,
      title: `No Validate ${random}`,
      assertRssFeedUrlExistsImpl,
    })

    expect(assertRssFeedUrlExistsImpl).not.toHaveBeenCalled()
    const row = await getRssFeedById(feed.id)
    expect(row).not.toBeNull()
  })
})
