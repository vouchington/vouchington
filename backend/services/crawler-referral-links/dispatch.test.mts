import { it, beforeAll, describe } from 'vitest'
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
import { createUserReferralLink } from '@services/user-referral-program-links/create'
import { deactivateUserReferralLink } from '@services/user-referral-program-links/activate'
import { getUrlById } from '@services/urls/get'
import type { PrivateUser } from '@services/users/types'
import { dispatchReferralLinkCrawls, enqueueReferralLinkCrawlsForUrlId } from './dispatch.mts'
import { backgroundCpu as crawlReferralLinksQueue } from '@queues/background-cpu/queues'
import { CRAWLER_USER_AGENT } from '@voucha/config'
import { getDateFromUUIDv7 } from '@modules/utils'

describe('dispatch', () => {
  let user: PrivateUser
  let referralProgramId: string
  let testHostname: string

  beforeAll(async () => {
    user = await createTestUser()
    const randomSuffix = Math.random().toString(36).slice(2, 10)
    testHostname = `dispatch-ref-${randomSuffix}.com`

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
    let rateLimitCalls = 0
    const rateLimitMs = 731

    const result = await dispatchReferralLinkCrawls({
      referralLinkIds: ownedIds,
      now: getDateFromUUIDv7(ownedIds.toSorted().at(-1)!)!,
      computeHostnameRateLimitMs: async () => {
        rateLimitCalls += 1
        return rateLimitMs
      },
    })

    assert.deepEqual(result, { count: 2, hasMore: false })
    const jobs = (await readAllQueueJobs(crawlReferralLinksQueue)).filter(
      job =>
        job.name === 'crawl.crawl_referral_link' &&
        ownedIds.includes((job.data as { linkId: string }).linkId),
    )
    assert.deepEqual(
      jobs.map(job => job.data).toSorted((a, b) => a.linkId.localeCompare(b.linkId)),
      [first, second]
        .map(link => ({ linkId: link.id, urlId: link.url_id, referralProgramId }))
        .toSorted((a, b) => a.linkId.localeCompare(b.linkId)),
    )
    assert.deepEqual(
      jobs.map(job => job.opts.ordering),
      [first, second].map(() => ({
        key: `crawl:${url.hostname.id}`,
        concurrency: 1,
        rateLimit: { max: 1, duration: rateLimitMs },
      })),
    )
    assert.equal(rateLimitCalls, 1)
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
    let computeCount = 0
    let enqueueCount = 0
    const rateLimitMs = 731

    await assert.rejects(
      dispatchReferralLinkCrawls({
        referralLinkIds: [targetLink.id],
        computeHostnameRateLimitMs: async (hostname, requestsPerSecondLimit, userAgent) => {
          computeCount += 1
          assert.equal(hostname, targetHostname)
          assert.equal(requestsPerSecondLimit, 1)
          assert.equal(userAgent, CRAWLER_USER_AGENT)
          return rateLimitMs
        },
        enqueueBulkCrawlReferralLinks: async (entries, options) => {
          enqueueCount += 1
          assert.deepEqual(entries, [
            {
              linkId: targetLink.id,
              urlId: targetLink.url_id,
              referralProgramId: targetFixture.referralProgramId,
            },
          ])
          assert.deepEqual(options, {
            hostnameId: targetUrl.hostname.id,
            rateLimitMs,
          })
          throw enqueueError
        },
      }),
      enqueueError,
    )
    assert.equal(computeCount, 1)
    assert.equal(enqueueCount, 1)

    const jobsAfter = await readAllQueueJobs(crawlReferralLinksQueue)
    const matchingJobsAfter = jobsAfter.filter(
      job => (job.data as { linkId?: string } | null | undefined)?.linkId === targetLink.id,
    )
    assert.deepEqual(matchingJobsAfter, matchingJobsBefore)
  })

  it('returns zero without dispatching when the referral link selection is empty', async () => {
    let computeCount = 0
    let enqueueCount = 0

    const dispatchedCount = await dispatchReferralLinkCrawls({
      referralLinkIds: [],
      computeHostnameRateLimitMs: async () => {
        computeCount += 1
        throw new Error('rate limit computation must not run for an empty selection')
      },
      enqueueBulkCrawlReferralLinks: async () => {
        enqueueCount += 1
        throw new Error('enqueue must not run for an empty selection')
      },
    })

    assert.deepEqual(dispatchedCount, { count: 0, hasMore: false })
    assert.equal(computeCount, 0)
    assert.equal(enqueueCount, 0)
  })

  it('uses a deterministic rate limit for a URL-specific enqueue failure', async () => {
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
    let computeCount = 0
    let enqueueCount = 0
    const rateLimitMs = 947

    await assert.rejects(
      enqueueReferralLinkCrawlsForUrlId(link.url_id, {
        computeHostnameRateLimitMs: async (hostname, requestsPerSecondLimit, userAgent) => {
          computeCount += 1
          assert.equal(hostname, testHostname)
          assert.equal(requestsPerSecondLimit, 1)
          assert.equal(userAgent, CRAWLER_USER_AGENT)
          return rateLimitMs
        },
        enqueueBulkCrawlReferralLinks: async (entries, options) => {
          enqueueCount += 1
          assert.deepEqual(entries, [
            {
              linkId: link.id,
              urlId: link.url_id,
              referralProgramId,
            },
          ])
          assert.deepEqual(options, {
            hostnameId: url.hostname.id,
            rateLimitMs,
          })
          throw enqueueError
        },
      }),
      enqueueError,
    )
    assert.equal(computeCount, 1)
    assert.equal(enqueueCount, 1)

    const jobsAfter = await readAllQueueJobs(crawlReferralLinksQueue)
    const matchingJobsAfter = jobsAfter.filter(
      job => (job.data as { linkId?: string } | null | undefined)?.linkId === link.id,
    )
    assert.deepEqual(matchingJobsAfter, matchingJobsBefore)
  })
})
