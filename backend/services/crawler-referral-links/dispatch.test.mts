import { it, beforeAll, describe } from 'vitest'
import assert from 'node:assert/strict'
import { createTestUser, createReferralProgramFixture } from '@voucha/test-helpers'
import {
  getReferralLinkCrawlStatus,
  setReferralLinkLastCrawlSuccessAtRecent,
  softDeleteReferralLink,
  isReferralLinkDispatchable,
  getReferralLinkDispatchRows,
} from '@voucha/test-helpers/entities/referral-links'
import { setHostnameAsValidForCrawlSearch } from '@voucha/test-helpers/entities/url-hostnames'
import { createUserReferralLink } from '@services/user-referral-program-links/create'
import { deactivateUserReferralLink } from '@services/user-referral-program-links/activate'
import { getUrlById } from '@services/urls/get'
import type { PrivateUser } from '@services/users/types'
import { dispatchReferralLinkCrawls, enqueueReferralLinkCrawlsForUrlId } from './dispatch.mts'
import { crawlReferralLinksQueue } from '@queues/crawl-referral-links/queues'
import { CRAWLER_USER_AGENT } from '@voucha/config'

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
    const link = await createUserReferralLink(user, {
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
    return createUserReferralLink(user, {
      user_id: user.id,
      referral_program_id: referralProgramId,
      url: `https://${testHostname}/ref/${suffix}`,
    })
  }

  it('dispatches only active links', async () => {
    const suffix = Math.random().toString(36).slice(2, 8)
    const activeLink = await createActiveLink(`active-${suffix}`)
    const deactivatedLink = await createActiveLink(`deact-${suffix}`)
    await deactivateUserReferralLink(user, deactivatedLink.id)

    // Verify active link is active and deactivated link is not
    const activeStatus = await getReferralLinkCrawlStatus(activeLink.id)
    assert.ok(activeStatus.activated_at)
    assert.equal(activeStatus.deactivated_at, null)

    const deactStatus = await getReferralLinkCrawlStatus(deactivatedLink.id)
    assert.equal(deactStatus.activated_at, null)
    assert.ok(deactStatus.deactivated_at)
  })

  it('links crawled within 7 days are skipped by dispatch query', async () => {
    const suffix = Math.random().toString(36).slice(2, 8)
    const recentLink = await createActiveLink(`recent-${suffix}`)

    // Set last_crawl_success_at to now (within 7 days)
    await setReferralLinkLastCrawlSuccessAtRecent(recentLink.id)

    // Dispatch query should exclude this link
    const dispatchable = await isReferralLinkDispatchable(recentLink.id)
    assert.equal(dispatchable, false, 'recently crawled link should be excluded from dispatch')
  })

  it('deleted links are skipped by dispatch query', async () => {
    const suffix = Math.random().toString(36).slice(2, 8)
    const link = await createActiveLink(`deleted-${suffix}`)

    // Soft-delete the link
    await softDeleteReferralLink(link.id)

    const dispatchable = await isReferralLinkDispatchable(link.id)
    assert.equal(dispatchable, false, 'deleted link should be excluded from dispatch')
  })

  it('groups links by hostname in dispatch query', async () => {
    const suffix = Math.random().toString(36).slice(2, 8)
    const link1 = await createActiveLink(`group-a-${suffix}`)
    const link2 = await createActiveLink(`group-b-${suffix}`)

    const rows = await getReferralLinkDispatchRows([link1.id, link2.id])

    assert.equal(rows.length, 2)
    // Both should share the same hostname
    assert.equal(rows[0].hostname, testHostname)
    assert.equal(rows[1].hostname, testHostname)
    assert.equal(rows[0].hostname_id, rows[1].hostname_id)
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
    const unrelatedLink = await createUserReferralLink(user, {
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
    const targetLink = await createUserReferralLink(user, {
      user_id: user.id,
      referral_program_id: targetFixture.referralProgramId,
      url: `https://${targetHostname}/ref/selected`,
    })
    const targetUrl = await getUrlById(targetLink.url_id)
    assert.ok(targetUrl)
    await setHostnameAsValidForCrawlSearch(targetUrl.hostname.id)

    assert.equal(await isReferralLinkDispatchable(unrelatedLink.id), true)
    assert.equal(await isReferralLinkDispatchable(targetLink.id), true)

    const enqueueError = new Error(`sentinel dispatcher enqueue failure ${suffix}`)
    const jobsBefore = await crawlReferralLinksQueue.getJobs('waiting')
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

    const jobsAfter = await crawlReferralLinksQueue.getJobs('waiting')
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

    assert.equal(dispatchedCount, 0)
    assert.equal(computeCount, 0)
    assert.equal(enqueueCount, 0)
  })

  it('uses a deterministic rate limit for a URL-specific enqueue failure', async () => {
    const suffix = Math.random().toString(36).slice(2, 8)
    const link = await createActiveLink(`enqueue-failure-${suffix}`)
    const url = await getUrlById(link.url_id)
    assert.ok(url)
    await setHostnameAsValidForCrawlSearch(url.hostname.id)
    const jobsBefore = await crawlReferralLinksQueue.getJobs('waiting')
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

    const jobsAfter = await crawlReferralLinksQueue.getJobs('waiting')
    const matchingJobsAfter = jobsAfter.filter(
      job => (job.data as { linkId?: string } | null | undefined)?.linkId === link.id,
    )
    assert.deepEqual(matchingJobsAfter, matchingJobsBefore)
  })
})
