import { it, beforeAll, afterAll, describe, vi } from 'vitest'
import assert from 'node:assert/strict'
import {
  createTestUser,
  createReferralProgramFixture,
  WEB_PROVENANCE,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import {
  setReferralLinkLastCrawlSuccessAtRecent,
  softDeleteReferralLink,
} from '@voucha/test-helpers/entities/referral-links'
import { setHostnameAsValidForCrawlSearch } from '@voucha/test-helpers/entities/url-hostnames'
import {
  deleteTestRobotsTxtCache,
  setTestRobotsTxtCache,
} from '@voucha/test-helpers/entities/dispatch'
import { createUserReferralLink } from '@services/user-referral-program-links/create'
import { deactivateUserReferralLink } from '@services/user-referral-program-links/activate'
import { getUrlById } from '@services/urls/get'
import type { PrivateUser } from '@services/users/types'
import { dispatchReferralLinkCrawls, enqueueReferralLinkCrawlsForUrlId } from './dispatch.mts'
import { backgroundCpu as crawlReferralLinksQueue } from '@queues/background-cpu/queues'
import { getDateFromUUIDv7 } from '@modules/utils'

const ROBOTS_CRAWL_DELAY_8S = 'User-agent: *\nAllow: /\nCrawl-delay: 8'
const ROBOTS_RATE_LIMIT_MS = 8_000

/** Fails the one bulk admission carrying the owned link; every other admission runs for real. */
function failOwnedBulkAdmission(linkId: string, error: Error) {
  const original = crawlReferralLinksQueue.addBulk as typeof crawlReferralLinksQueue.addBulk
  const owned: Parameters<typeof original>[0][] = []
  const spy = vi.spyOn(crawlReferralLinksQueue, 'addBulk').mockImplementation(((
    ...args: Parameters<typeof original>
  ) => {
    if (args[0].some(job => (job.data as { linkId?: string }).linkId === linkId)) {
      owned.push(args[0])
      throw error
    }
    return Reflect.apply(original, crawlReferralLinksQueue, args) as ReturnType<typeof original>
  }) as typeof original)
  return { owned, restore: () => spy.mockRestore() }
}

function assertFailedAdmission(
  owned: Parameters<typeof crawlReferralLinksQueue.addBulk>[0][],
  expected: { linkId: string; urlId: string; referralProgramId: string; hostnameId: string },
) {
  assert.equal(owned.length, 1)
  assert.deepEqual(
    owned[0]!.map(job => job.data),
    [
      {
        linkId: expected.linkId,
        urlId: expected.urlId,
        referralProgramId: expected.referralProgramId,
      },
    ],
  )
  const ordering = owned[0]![0]!.opts?.ordering
  assert.equal(ordering?.key, `crawl:${expected.hostnameId}`)
  assert.deepEqual(ordering?.rateLimit, { max: 1, duration: ROBOTS_RATE_LIMIT_MS })
}

describe('dispatch', () => {
  const seededHostnames: string[] = []
  let user: PrivateUser
  let referralProgramId: string
  let testHostname: string

  async function seedRobots(hostname: string) {
    seededHostnames.push(hostname)
    await setTestRobotsTxtCache(hostname, ROBOTS_CRAWL_DELAY_8S)
  }

  beforeAll(async () => {
    user = await createTestUser()
    const randomSuffix = Math.random().toString(36).slice(2, 10)
    testHostname = `dispatch-ref-${randomSuffix}.com`
    await seedRobots(testHostname)

    const fixture = await createReferralProgramFixture({
      createdById: user.id,
      randomSuffix,
      hostname: testHostname,
      pathname: '/ref/%',
    })
    referralProgramId = fixture.referralProgramId

    // Make the hostname crawlable
    const link = await createUserReferralLink(user, WEB_PROVENANCE, {
      user_id: user.id,
      referral_program_id: referralProgramId,
      url: `https://${testHostname}/ref/setup`,
    })
    const url = await getUrlById(link.url_id)
    if (url) {
      await setHostnameAsValidForCrawlSearch(url.hostname.id)
    }
  })

  afterAll(() => deleteTestRobotsTxtCache(...seededHostnames))

  function createActiveLink(suffix: string) {
    return createUserReferralLink(user, WEB_PROVENANCE, {
      user_id: user.id,
      referral_program_id: referralProgramId,
      url: `https://${testHostname}/ref/${suffix}`,
    })
  }

  it('enqueues only due active links with shared hostname ordering', async () => {
    const suffix = Math.random().toString(36).slice(2, 8)
    const [first, second, recent, deleted, deactivated] = await Promise.all(
      ['first', 'second', 'recent', 'deleted', 'deactivated'].map(label =>
        createActiveLink(`${label}-${suffix}`),
      ),
    )
    assert.ok(first && second && recent && deleted && deactivated)
    await setReferralLinkLastCrawlSuccessAtRecent(recent.id)
    await softDeleteReferralLink(deleted.id)
    await deactivateUserReferralLink(user, deactivated.id)
    const url = await getUrlById(first.url_id)
    assert.ok(url)
    const ownedIds = [first.id, second.id, recent.id, deleted.id, deactivated.id]
    const result = await dispatchReferralLinkCrawls({
      referralLinkIds: ownedIds,
      now: getDateFromUUIDv7(ownedIds.toSorted().at(-1)!)!,
    })

    assert.deepEqual(result, { count: 2, hasMore: false })
    const jobs = (await readAllQueueJobs(crawlReferralLinksQueue)).filter(
      job =>
        job.name === 'crawl.crawl_referral_link' &&
        ownedIds.includes((job.data as { linkId: string }).linkId),
    )
    assert.deepEqual(
      jobs
        .map(job => job.data as { linkId: string })
        .toSorted((a, b) => a.linkId.localeCompare(b.linkId)),
      [first, second]
        .map(link => ({ linkId: link.id, urlId: link.url_id, referralProgramId }))
        .toSorted((a, b) => a.linkId.localeCompare(b.linkId)),
    )
    assert.deepEqual(
      jobs.map(job => job.opts.ordering),
      [first, second].map(() => ({
        key: `crawl:${url.hostname.id}`,
        concurrency: 1,
        rateLimit: { max: 1, duration: ROBOTS_RATE_LIMIT_MS },
      })),
    )
  })

  it('scopes a scheduled enqueue failure to the selected referral link', async () => {
    const suffix = Math.random().toString(36).slice(2, 8)
    const unrelatedHostname = `dispatch-unrelated-${suffix}.com`
    const unrelatedFixture = await createReferralProgramFixture({
      createdById: user.id,
      randomSuffix: `unrelated${suffix}`,
      hostname: unrelatedHostname,
      pathname: '/ref/%',
    })
    const unrelatedLink = await createUserReferralLink(user, WEB_PROVENANCE, {
      user_id: user.id,
      referral_program_id: unrelatedFixture.referralProgramId,
      url: `https://${unrelatedHostname}/ref/unselected`,
    })
    const unrelatedUrl = await getUrlById(unrelatedLink.url_id)
    assert.ok(unrelatedUrl)
    await setHostnameAsValidForCrawlSearch(unrelatedUrl.hostname.id)

    const targetHostname = `dispatch-target-${suffix}.com`
    await seedRobots(targetHostname)
    const targetFixture = await createReferralProgramFixture({
      createdById: user.id,
      randomSuffix: `target${suffix}`,
      hostname: targetHostname,
      pathname: '/ref/%',
    })
    const targetLink = await createUserReferralLink(user, WEB_PROVENANCE, {
      user_id: user.id,
      referral_program_id: targetFixture.referralProgramId,
      url: `https://${targetHostname}/ref/selected`,
    })
    const targetUrl = await getUrlById(targetLink.url_id)
    assert.ok(targetUrl)
    await setHostnameAsValidForCrawlSearch(targetUrl.hostname.id)

    const enqueueError = new Error(`sentinel dispatcher enqueue failure ${suffix}`)
    const jobsBefore = await readAllQueueJobs(crawlReferralLinksQueue)
    const matchingJobsBefore = jobsBefore.filter(
      job => (job.data as { linkId?: string } | null | undefined)?.linkId === targetLink.id,
    )
    const failure = failOwnedBulkAdmission(targetLink.id, enqueueError)

    try {
      await assert.rejects(
        dispatchReferralLinkCrawls({ referralLinkIds: [targetLink.id] }),
        enqueueError,
      )
    } finally {
      failure.restore()
    }
    assertFailedAdmission(failure.owned, {
      linkId: targetLink.id,
      urlId: targetLink.url_id,
      referralProgramId: targetFixture.referralProgramId,
      hostnameId: targetUrl.hostname.id,
    })

    const jobsAfter = await readAllQueueJobs(crawlReferralLinksQueue)
    const matchingJobsAfter = jobsAfter.filter(
      job => (job.data as { linkId?: string } | null | undefined)?.linkId === targetLink.id,
    )
    assert.deepEqual(matchingJobsAfter, matchingJobsBefore)
  })

  it('returns zero without dispatching when the referral link selection is empty', async () => {
    const addBulk = vi.spyOn(crawlReferralLinksQueue, 'addBulk')

    try {
      assert.deepEqual(await dispatchReferralLinkCrawls({ referralLinkIds: [] }), {
        count: 0,
        hasMore: false,
      })
      assert.equal(addBulk.mock.calls.length, 0)
    } finally {
      addBulk.mockRestore()
    }
  })

  it('surfaces a URL-specific enqueue failure with the robots Crawl-delay rate limit', async () => {
    const suffix = Math.random().toString(36).slice(2, 8)
    const link = await createActiveLink(`enqueue-failure-${suffix}`)
    const url = await getUrlById(link.url_id)
    assert.ok(url)
    await setHostnameAsValidForCrawlSearch(url.hostname.id)
    const jobsBefore = await readAllQueueJobs(crawlReferralLinksQueue)
    const matchingJobsBefore = jobsBefore.filter(
      job => (job.data as { linkId?: string } | null | undefined)?.linkId === link.id,
    )
    const enqueueError = new Error(`sentinel enqueue failure ${suffix}`)
    const failure = failOwnedBulkAdmission(link.id, enqueueError)

    try {
      await assert.rejects(enqueueReferralLinkCrawlsForUrlId(link.url_id), enqueueError)
    } finally {
      failure.restore()
    }
    assertFailedAdmission(failure.owned, {
      linkId: link.id,
      urlId: link.url_id,
      referralProgramId,
      hostnameId: url.hostname.id,
    })

    const jobsAfter = await readAllQueueJobs(crawlReferralLinksQueue)
    const matchingJobsAfter = jobsAfter.filter(
      job => (job.data as { linkId?: string } | null | undefined)?.linkId === link.id,
    )
    assert.deepEqual(matchingJobsAfter, matchingJobsBefore)
  })
})
