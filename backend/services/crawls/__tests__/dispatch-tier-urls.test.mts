import { randomUUID } from 'node:crypto'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { dispatchTier1CrawlUrls, dispatchTier2CrawlUrls } from '../dispatch-tier-urls.mts'
import { getMaxUUIDv7ForDate } from '@modules/utils'
import {
  createEntityRelationWithElection,
  createReferralProgramFixture,
  createTestPost,
  createTestUser,
  createTestUserProfileLink,
  deleteTestRobotsTxtCache,
  insertTestRssFeedDirect,
  insertTestUrlDirect,
  insertTestUserReferralProgramLink,
  setTestRobotsTxtCache,
} from '@voucha/test-helpers'
import {
  expireTestHostnameNetworkBackoff,
  openTestHostnameNetworkBackoff,
} from '@voucha/test-helpers/entities/url-hostname-network-backoff'
import { backgroundCpu as crawlUrls } from '@queues/background-cpu/queues'
import { getUrlById } from '@services/urls/get'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { deactivateUserReferralLink } from '@services/user-referral-program-links/activate'
import type { PrivateUser } from '@services/users/types'
import type { Job } from 'glide-mq'

const RATE_LIMIT_MS = 2_500
const CRAWL_URL_RETRY = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000, jitter: 0.5 },
}
const CRAWL_URL_RETENTION = { removeOnComplete: 100, removeOnFail: 100 }

let user: PrivateUser
let ownedRobotsTxtHostnames: string[] = []

function ownedUrlWindow(size: number) {
  const historicalRangeMs = Date.UTC(2021, 0, 1) - Date.UTC(1971, 0, 1)
  const time = new Date(
    Date.UTC(1971, 0, 1) +
      Number(
        BigInt(`0x${randomUUID().replaceAll('-', '').slice(0, 12)}`) % BigInt(historicalRangeMs),
      ),
  )
  const upperId = getMaxUUIDv7ForDate(time)
  const upper = BigInt(`0x${upperId.replaceAll('-', '')}`)
  const idAtOffset = (offset: number) => {
    const hex = (upper - BigInt(offset)).toString(16).padStart(32, '0')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return {
    ids: Array.from({ length: size }, (_, index) => idAtOffset(size - index - 1)),
    cursor: {
      sweepStartedAt: new Date(time.getTime() + 1).toISOString(),
      afterId: idAtOffset(size),
    },
  }
}

async function createTestUrl(hostname: string, pathname: string, id: string) {
  await seedRobotsCache(hostname)
  const url = await insertTestUrlDirect(user.id, `https://${hostname}${pathname}`, { id })
  expect(url).toBeTruthy()
  await updateUrlHostname(url!.hostname.id, { is_crawlable: true })
  return url!
}

async function seedRobotsCache(hostname: string, robotsTxt = 'User-agent: *\nAllow: /') {
  await setTestRobotsTxtCache(hostname, robotsTxt)
  if (!ownedRobotsTxtHostnames.includes(hostname)) ownedRobotsTxtHostnames.push(hostname)
}

async function seedCrawlDelay(hostname: string): Promise<void> {
  await seedRobotsCache(hostname, 'User-agent: *\nCrawl-delay: 2.5')
}

async function findCrawlJobsByUrlId(urlId: string): Promise<Job[]> {
  return crawlUrls.searchJobs({
    name: 'crawl.crawl_url',
    data: { url_id: urlId },
  })
}

async function expectExactCrawlJob(urlId: string, hostnameId: string): Promise<void> {
  const jobs = await findCrawlJobsByUrlId(urlId)
  expect(jobs).toHaveLength(1)
  const [job] = jobs
  expect(job).toMatchObject({
    name: 'crawl.crawl_url',
    data: { url_id: urlId },
    opts: {
      ...CRAWL_URL_RETRY,
      ...CRAWL_URL_RETENTION,
      priority: 10,
      deduplication: {
        id: `crawl.crawl_url__${urlId}`,
        mode: 'debounce',
      },
      ordering: {
        key: `crawl:${hostnameId}`,
        rateLimit: { max: 1, duration: RATE_LIMIT_MS },
      },
    },
  })
  expect(job!.data).toEqual({ url_id: urlId })
  expect(job!.opts).toEqual({
    ...CRAWL_URL_RETRY,
    ...CRAWL_URL_RETENTION,
    lockDuration: 120_000,
    priority: 10,
    deduplication: {
      id: `crawl.crawl_url__${urlId}`,
      mode: 'debounce',
    },
    ordering: {
      key: `crawl:${hostnameId}`,
      concurrency: 1,
      rateLimit: { max: 1, duration: RATE_LIMIT_MS },
    },
  })
}

async function expectNoCrawlJob(urlId: string): Promise<void> {
  await expect(findCrawlJobsByUrlId(urlId)).resolves.toEqual([])
}

describe('dispatch-tier-urls', () => {
  beforeAll(async () => {
    user = await createTestUser()
  })

  afterEach(async () => {
    if (ownedRobotsTxtHostnames.length > 0) {
      await deleteTestRobotsTxtCache(...ownedRobotsTxtHostnames)
    }
    ownedRobotsTxtHostnames = []
  })

  it('dispatches eligible Tier 1 URLs as exact per-hostname crawl jobs', async () => {
    const suffix = randomUUID()
    const window = ownedUrlWindow(5)
    const sharedHostname = `tier1-${suffix}.example.com`
    const positiveVoteUrl = await createTestUrl(sharedHostname, '/positive-vote', window.ids[0]!)
    const profileUrl = await createTestUrl(sharedHostname, '/profile', window.ids[1]!)
    const post = await createTestPost({ user })
    await createEntityRelationWithElection(post.id, positiveVoteUrl.id, user.id, 1)
    await createTestUserProfileLink(user.id, profileUrl.id)

    const rssHostname = `feed-${randomUUID()}.example.com`
    const rssFeedUrl = `https://${rssHostname}/feed.xml`
    await seedRobotsCache(rssHostname)
    const ownedRssUrl = await insertTestUrlDirect(null, rssFeedUrl, {
      id: window.ids[2]!,
      content_type: 'application/rss+xml',
    })
    expect(ownedRssUrl).toBeTruthy()
    const feed = await insertTestRssFeedDirect({
      rssFeedUrl: ownedRssUrl!.url,
      homePageUrl: `https://${rssHostname}/home`,
    })
    expect(feed.rss_feed_url_id).toBe(ownedRssUrl!.id)
    const rssUrl = await getUrlById(feed.rss_feed_url_id)
    expect(rssUrl).toBeTruthy()
    await updateUrlHostname(rssUrl!.hostname.id, { is_crawlable: true })
    await createTestUserProfileLink(user.id, rssUrl!.id)

    const referral = await createReferralProgramFixture({
      createdById: user.id,
      randomSuffix: randomUUID().replaceAll('-', ''),
    })
    await seedRobotsCache(referral.hostname)
    const activeReferralUrl = await insertTestUrlDirect(
      user.id,
      `https://${referral.hostname}/active/${suffix}`,
      { id: window.ids[3]! },
    )
    const inactiveReferralUrl = await insertTestUrlDirect(
      user.id,
      `https://${referral.hostname}/inactive/${suffix}`,
      { id: window.ids[4]! },
    )
    expect(activeReferralUrl).toBeTruthy()
    expect(inactiveReferralUrl).toBeTruthy()
    await updateUrlHostname(activeReferralUrl!.hostname.id, { is_crawlable: true })
    await createTestUserProfileLink(user.id, activeReferralUrl!.id)
    await createTestUserProfileLink(user.id, inactiveReferralUrl!.id)
    await insertTestUserReferralProgramLink({
      userId: user.id,
      referralProgramId: referral.referralProgramId,
      urlId: activeReferralUrl!.id,
    })
    const inactiveLinkId = await insertTestUserReferralProgramLink({
      userId: user.id,
      referralProgramId: referral.referralProgramId,
      urlId: inactiveReferralUrl!.id,
    })
    await deactivateUserReferralLink(user, inactiveLinkId)

    await seedCrawlDelay(referral.hostname)
    await seedCrawlDelay(sharedHostname)

    await dispatchTier1CrawlUrls(window.cursor)

    for (const url of [positiveVoteUrl, profileUrl]) {
      await expectExactCrawlJob(url.id, url.hostname.id)
    }
    await expectExactCrawlJob(inactiveReferralUrl!.id, inactiveReferralUrl!.hostname.id)
    await expectNoCrawlJob(rssUrl!.id)
    await expectNoCrawlJob(activeReferralUrl!.id)
  })

  it('dispatches eligible Tier 2 URLs as exact per-hostname crawl jobs', async () => {
    const suffix = randomUUID()
    const window = ownedUrlWindow(3)
    const hostname = `tier2-${suffix}.example.com`
    const firstTier2Url = await createTestUrl(hostname, '/neutral-one', window.ids[0]!)
    const secondTier2Url = await createTestUrl(hostname, '/neutral-two', window.ids[1]!)
    const tier1Url = await createTestUrl(hostname, '/tier-one', window.ids[2]!)
    const [firstPost, secondPost, tier1Post] = await Promise.all([
      createTestPost({ user }),
      createTestPost({ user }),
      createTestPost({ user }),
    ])
    await createEntityRelationWithElection(firstPost.id, firstTier2Url.id, user.id, 0)
    await createEntityRelationWithElection(secondPost.id, secondTier2Url.id, user.id, 0)
    await createEntityRelationWithElection(tier1Post.id, tier1Url.id, user.id, 0)
    await createTestUserProfileLink(user.id, tier1Url.id)
    await seedCrawlDelay(hostname)

    await dispatchTier2CrawlUrls(window.cursor)

    for (const url of [firstTier2Url, secondTier2Url]) {
      await expectExactCrawlJob(url.id, url.hostname.id)
    }
    await expectNoCrawlJob(tier1Url.id)
  })

  it('skips hostnames in an open network backoff until it expires', async () => {
    const window = ownedUrlWindow(1)
    const hostname = `tier-backoff-${randomUUID()}.example.com`
    const url = await createTestUrl(hostname, '/profile', window.ids[0]!)
    await createTestUserProfileLink(user.id, url.id)
    await seedCrawlDelay(hostname)
    await openTestHostnameNetworkBackoff(url.hostname.id)

    await dispatchTier1CrawlUrls(window.cursor)
    await expectNoCrawlJob(url.id)

    await expireTestHostnameNetworkBackoff(url.hostname.id)
    await dispatchTier1CrawlUrls(window.cursor)
    await expectExactCrawlJob(url.id, url.hostname.id)
  })
})
