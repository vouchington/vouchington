import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { crawlReferralLinksQueue } from '@queues/crawl-referral-links/queues'
import { crawlUrls } from '@queues/crawler/queues'
import { rss_feeds } from '@queues/rss-feeds/queues'
import { enqueueManualUrlCrawlAsCurrentUser } from './manual-crawl.mts'
import type { PrivateUser } from '@services/users/types'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import {
  createReferralProgramFixture,
  createTestUser,
  insertTestRssFeedDirect,
  insertTestUrlDirect,
  insertTestUserReferralProgramLink,
  readAllQueueJobs,
} from '@voucha/test-helpers'

describe('enqueueManualUrlCrawlAsCurrentUser', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  beforeEach(async () => {
    await Promise.all([
      crawlReferralLinksQueue.obliterate({ force: true }),
      crawlUrls.obliterate({ force: true }),
      rss_feeds.obliterate({ force: true }),
    ])
  })

  it('routes RSS feed URLs to the RSS fetch queue instead of the HTML crawl queue', async () => {
    const feed = await insertTestRssFeedDirect({})

    const result = await enqueueManualUrlCrawlAsCurrentUser(admin, feed.rss_feed_url_id)

    expect(result).toEqual({
      target: 'rss_feed',
      enqueued_count: 1,
      rss_feed_id: feed.id,
    })
    const [rssJobs, htmlJobs, referralJobs] = await Promise.all([
      rss_feeds.getJobs('waiting'),
      readAllQueueJobs(crawlUrls),
      crawlReferralLinksQueue.getJobs('waiting'),
    ])
    expect(rssJobs).toHaveLength(1)
    expect(rssJobs[0]?.name).toBe('fetchRssFeed')
    expect(rssJobs[0]?.data).toMatchObject({ rssFeedId: feed.id, ttl: 0 })
    expect(htmlJobs).toHaveLength(0)
    expect(referralJobs).toHaveLength(0)
  })

  it('routes active referral-link URLs to the referral-link queue instead of the HTML crawl queue', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const referralProgram = await createReferralProgramFixture({
      createdById: admin.id,
      randomSuffix: random,
    })
    const url = await insertTestUrlDirect(
      admin.id,
      `https://${referralProgram.hostname}/ref/manual-${random}`,
    )
    expect(url).toBeTruthy()
    await updateUrlHostname(url!.hostname.id, { crawlable: true })
    const linkId = await insertTestUserReferralProgramLink({
      userId: admin.id,
      referralProgramId: referralProgram.referralProgramId,
      urlId: url!.id,
    })

    const result = await enqueueManualUrlCrawlAsCurrentUser(admin, url!.id)

    expect(result).toEqual({ target: 'referral_link', enqueued_count: 1 })
    const [rssJobs, htmlJobs, referralJobs] = await Promise.all([
      rss_feeds.getJobs('waiting'),
      readAllQueueJobs(crawlUrls),
      crawlReferralLinksQueue.getJobs('waiting'),
    ])
    expect(rssJobs).toHaveLength(0)
    expect(htmlJobs).toHaveLength(0)
    expect(referralJobs).toHaveLength(1)
    expect(referralJobs[0]?.name).toBe('crawl_referral_link')
    expect(referralJobs[0]?.data).toMatchObject({
      linkId,
      urlId: url!.id,
      referralProgramId: referralProgram.referralProgramId,
    })
  })

  it('routes active referral-link URLs with unset crawlability to the referral-link queue', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const referralProgram = await createReferralProgramFixture({
      createdById: admin.id,
      randomSuffix: random,
    })
    const url = await insertTestUrlDirect(
      admin.id,
      `https://${referralProgram.hostname}/ref/manual-unset-${random}`,
    )
    expect(url).toBeTruthy()
    await insertTestUserReferralProgramLink({
      userId: admin.id,
      referralProgramId: referralProgram.referralProgramId,
      urlId: url!.id,
    })

    const result = await enqueueManualUrlCrawlAsCurrentUser(admin, url!.id)

    expect(result).toEqual({ target: 'referral_link', enqueued_count: 1 })
    const [htmlJobs, referralJobs] = await Promise.all([
      readAllQueueJobs(crawlUrls),
      crawlReferralLinksQueue.getJobs('waiting'),
    ])
    expect(htmlJobs).toHaveLength(0)
    expect(referralJobs).toHaveLength(1)
    expect(referralJobs[0]?.data).toMatchObject({ urlId: url!.id })
  })

  it('does not fall back to HTML when an active referral-link URL is not enqueued', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const referralProgram = await createReferralProgramFixture({
      createdById: admin.id,
      randomSuffix: random,
    })
    const url = await insertTestUrlDirect(
      admin.id,
      `https://${referralProgram.hostname}/ref/manual-blocked-${random}`,
    )
    expect(url).toBeTruthy()
    await updateUrlHostname(url!.hostname.id, { crawlable: false })
    await insertTestUserReferralProgramLink({
      userId: admin.id,
      referralProgramId: referralProgram.referralProgramId,
      urlId: url!.id,
    })

    const result = await enqueueManualUrlCrawlAsCurrentUser(admin, url!.id)

    expect(result).toEqual({ target: 'referral_link', enqueued_count: 0 })
    const [rssJobs, htmlJobs, referralJobs] = await Promise.all([
      rss_feeds.getJobs('waiting'),
      readAllQueueJobs(crawlUrls),
      crawlReferralLinksQueue.getJobs('waiting'),
    ])
    expect(rssJobs).toHaveLength(0)
    expect(htmlJobs).toHaveLength(0)
    expect(referralJobs).toHaveLength(0)
  })

  it('routes ordinary URLs to the HTML crawl queue', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const url = await insertTestUrlDirect(
      admin.id,
      `https://manual-html-${random}.example.com/page`,
    )
    expect(url).toBeTruthy()

    const result = await enqueueManualUrlCrawlAsCurrentUser(admin, url!.id)

    expect(result).toEqual({ target: 'html_url', enqueued_count: 1 })
    const [rssJobs, htmlJobs, referralJobs] = await Promise.all([
      rss_feeds.getJobs('waiting'),
      readAllQueueJobs(crawlUrls),
      crawlReferralLinksQueue.getJobs('waiting'),
    ])
    expect(rssJobs).toHaveLength(0)
    expect(referralJobs).toHaveLength(0)
    expect(htmlJobs).toHaveLength(1)
    expect(htmlJobs[0]?.name).toBe('crawl_url')
    expect(htmlJobs[0]?.data).toMatchObject({ url_id: url!.id })
  })
})
