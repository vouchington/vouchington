import { randomUUID } from 'node:crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { dispatchTier1CrawlUrls, dispatchTier2CrawlUrls } from '../dispatch-tier-urls.mts'
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
import { crawlUrls } from '@queues/crawler/queues'
import { addUrl } from '@services/urls/upsert'
import { getUrlById } from '@services/urls/get'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { deactivateUserReferralLink } from '@services/user-referral-program-links/activate'
import type { PrivateUser } from '@services/users/types'
import type { Job } from 'glide-mq'

const fetchWithTimeoutSimpleMock = vi.hoisted(() =>
  vi.fn<typeof import('@modules/utils/http').fetchWithTimeoutSimple>(),
)

vi.mock<typeof import('@modules/utils/http')>(
  import('@modules/utils/http'),
  async importOriginal => ({
    ...(await importOriginal()),
    fetchWithTimeoutSimple: fetchWithTimeoutSimpleMock,
  }),
)

const RATE_LIMIT_MS = 2_500
const CRAWL_URL_RETRY = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000, jitter: 0.5 },
}
const CRAWL_URL_RETENTION = { removeOnComplete: 100, removeOnFail: 100 }

let user: PrivateUser
let ownedRobotsTxtHostnames: string[] = []

async function createTestUrl(hostname: string, pathname: string) {
  const url = await addUrl(user.id, `https://${hostname}${pathname}`)
  expect(url).toBeTruthy()
  await updateUrlHostname(url!.hostname.id, { crawlable: true })
  return url!
}

async function seedCrawlDelay(hostname: string): Promise<void> {
  await setTestRobotsTxtCache(hostname, 'User-agent: *\nCrawl-delay: 2.5')
  ownedRobotsTxtHostnames.push(hostname)
}

async function findWaitingJobsByUrlId(urlId: string): Promise<Job[]> {
  return crawlUrls.searchJobs({
    state: 'waiting',
    name: 'crawl_url',
    data: { url_id: urlId },
  })
}

async function expectExactWaitingJob(urlId: string, hostnameId: string): Promise<void> {
  const jobs = await findWaitingJobsByUrlId(urlId)
  expect(jobs).toHaveLength(1)
  const [job] = jobs
  expect(job).toMatchObject({
    name: 'crawl_url',
    data: { url_id: urlId },
    opts: {
      ...CRAWL_URL_RETRY,
      ...CRAWL_URL_RETENTION,
      priority: 10,
      deduplication: {
        id: `crawl_url__${urlId}`,
        mode: 'debounce',
        ttl: RATE_LIMIT_MS,
      },
      ordering: {
        key: hostnameId,
        rateLimit: { max: 1, duration: RATE_LIMIT_MS },
      },
    },
  })
  expect(job!.data).toEqual({ url_id: urlId })
  expect(job!.opts).toEqual({
    ...CRAWL_URL_RETRY,
    ...CRAWL_URL_RETENTION,
    priority: 10,
    deduplication: {
      id: `crawl_url__${urlId}`,
      mode: 'debounce',
      ttl: RATE_LIMIT_MS,
    },
    ordering: {
      key: hostnameId,
      rateLimit: { max: 1, duration: RATE_LIMIT_MS },
    },
  })
}

async function expectNoWaitingJob(urlId: string): Promise<void> {
  await expect(findWaitingJobsByUrlId(urlId)).resolves.toEqual([])
}

describe('dispatch-tier-urls', () => {
  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(async () => {
    fetchWithTimeoutSimpleMock.mockReset()
    fetchWithTimeoutSimpleMock.mockImplementation(
      async () => new Response('User-agent: *\nAllow: /', { status: 200 }),
    )
    ownedRobotsTxtHostnames = []
  })

  afterEach(async () => {
    if (ownedRobotsTxtHostnames.length > 0) {
      await deleteTestRobotsTxtCache(...ownedRobotsTxtHostnames)
    }
  })

  it('dispatches eligible Tier 1 URLs as exact per-hostname crawl jobs', async () => {
    const suffix = randomUUID()
    const sharedHostname = `tier1-${suffix}.example.com`
    const positiveVoteUrl = await createTestUrl(sharedHostname, '/positive-vote')
    const profileUrl = await createTestUrl(sharedHostname, '/profile')
    const post = await createTestPost({ user })
    await createEntityRelationWithElection(post.id, positiveVoteUrl.id, user.id, 1)
    await createTestUserProfileLink(user.id, profileUrl.id)

    const feed = await insertTestRssFeedDirect({})
    const rssUrl = await getUrlById(feed.rss_feed_url_id)
    expect(rssUrl).toBeTruthy()
    await updateUrlHostname(rssUrl!.hostname.id, { crawlable: true })
    await createTestUserProfileLink(user.id, rssUrl!.id)

    const referral = await createReferralProgramFixture({
      createdById: user.id,
      randomSuffix: randomUUID().replaceAll('-', ''),
    })
    const activeReferralUrl = await insertTestUrlDirect(
      user.id,
      `https://${referral.hostname}/active/${suffix}`,
    )
    const inactiveReferralUrl = await insertTestUrlDirect(
      user.id,
      `https://${referral.hostname}/inactive/${suffix}`,
    )
    expect(activeReferralUrl).toBeTruthy()
    expect(inactiveReferralUrl).toBeTruthy()
    await updateUrlHostname(activeReferralUrl!.hostname.id, { crawlable: true })
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

    await seedCrawlDelay(sharedHostname)
    await seedCrawlDelay(referral.hostname)

    await dispatchTier1CrawlUrls()

    for (const url of [positiveVoteUrl, profileUrl]) {
      await expectExactWaitingJob(url.id, url.hostname.id)
    }
    await expectExactWaitingJob(inactiveReferralUrl!.id, inactiveReferralUrl!.hostname.id)
    await expectNoWaitingJob(rssUrl!.id)
    await expectNoWaitingJob(activeReferralUrl!.id)
  })

  it('dispatches eligible Tier 2 URLs as exact per-hostname crawl jobs', async () => {
    const suffix = randomUUID()
    const hostname = `tier2-${suffix}.example.com`
    const firstTier2Url = await createTestUrl(hostname, '/neutral-one')
    const secondTier2Url = await createTestUrl(hostname, '/neutral-two')
    const tier1Url = await createTestUrl(hostname, '/tier-one')
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

    await dispatchTier2CrawlUrls()

    for (const url of [firstTier2Url, secondTier2Url]) {
      await expectExactWaitingJob(url.id, url.hostname.id)
    }
    await expectNoWaitingJob(tier1Url.id)
  })
})
