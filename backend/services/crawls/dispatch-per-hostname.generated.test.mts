import { expect, it, beforeAll, describe } from 'vitest'
import { dispatchCrawlUrlsPerHostname } from './dispatch-per-hostname.mts'
import { createCrawler } from '@services/crawlers'
import { createCrawl } from './create.mts'
import { addUrl } from '@services/urls/upsert'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import {
  createReferralProgramFixture,
  createTestUser,
  getCrawlableHostnames,
  insertTestRssFeedDirect,
  insertTestUrlDirect,
  insertTestUserReferralProgramLink,
  setUrlHostnameAttemptThresholdHoursForTest,
  updateUrlHostnameBlocked,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { getUrlById } from '@services/urls/get'
import { deactivateUserReferralLink } from '@services/user-referral-program-links/activate'

describe('dispatch-per-hostname.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('dispatchCrawlUrlsPerHostname returns 0 when hostname is blocked', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostnameValue = `dispatch-blocked-${random}.example.com`
    const url = await addUrl(user.id, `https://${hostnameValue}/test`)
    await updateUrlHostnameBlocked(url!.hostname.id, true)

    const result = await dispatchCrawlUrlsPerHostname(url!.hostname.id)

    expect(result).toBe(0)
  })

  it('dispatchCrawlUrlsPerHostname returns 0 when hostname is not crawlable', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostnameValue = `dispatch-not-crawlable-${random}.example.com`
    const url = await addUrl(user.id, `https://${hostnameValue}/test`)
    await updateUrlHostname(url!.hostname.id, { crawlable: false })

    const result = await dispatchCrawlUrlsPerHostname(url!.hostname.id)

    expect(result).toBe(0)
  })

  it('dispatchCrawlUrlsPerHostname returns 0 when hostname does not exist', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'

    const result = await dispatchCrawlUrlsPerHostname(fakeId)

    expect(result).toBe(0)
  })

  it('uses custom attempt threshold hours when filtering recent crawl attempts', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostnameValue = `dispatch-attempt-threshold-${random}.example.com`
    const url = await addUrl(user.id, `https://${hostnameValue}/test`)
    await updateUrlHostname(url!.hostname.id, { crawlable: true })
    await setUrlHostnameAttemptThresholdHoursForTest(url!.hostname.id, 2)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    await createCrawl(url!.id, crawler.id)

    const result = await dispatchCrawlUrlsPerHostname(url!.hostname.id)

    expect(result).toBe(0)
  })

  it('does not dispatch RSS feed URLs through the HTML crawler', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const feed = await insertTestRssFeedDirect({
      rssFeedUrl: `https://dispatch-rss-feed-${random}.example.com/feed.xml`,
      homePageUrl: `https://dispatch-rss-home-${random}.example.com/home`,
    })
    const url = await getUrlById(feed.rss_feed_url_id)
    expect(url).toBeTruthy()
    await updateUrlHostname(url!.hostname.id, { crawlable: true })

    const result = await dispatchCrawlUrlsPerHostname(url!.hostname.id)

    expect(result).toBe(0)
  })

  it('does not dispatch referral-link URLs through the HTML crawler', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const fixture = await createReferralProgramFixture({
      createdById: user.id,
      randomSuffix: random,
    })
    const url = await insertTestUrlDirect(user.id, `https://${fixture.hostname}/ref/${random}`)
    expect(url).toBeTruthy()
    await updateUrlHostname(url!.hostname.id, { crawlable: true })
    await insertTestUserReferralProgramLink({
      userId: user.id,
      referralProgramId: fixture.referralProgramId,
      urlId: url!.id,
    })

    const result = await dispatchCrawlUrlsPerHostname(url!.hostname.id)

    expect(result).toBe(0)
  })

  it('dispatches deactivated referral-link URLs through the HTML crawler', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const fixture = await createReferralProgramFixture({
      createdById: user.id,
      randomSuffix: random,
    })
    const url = await insertTestUrlDirect(user.id, `https://${fixture.hostname}/inactive/${random}`)
    expect(url).toBeTruthy()
    await updateUrlHostname(url!.hostname.id, { crawlable: true })
    const linkId = await insertTestUserReferralProgramLink({
      userId: user.id,
      referralProgramId: fixture.referralProgramId,
      urlId: url!.id,
    })
    await deactivateUserReferralLink(user, linkId)

    const result = await dispatchCrawlUrlsPerHostname(url!.hostname.id)

    expect(result).toBe(1)
  })

  it('crawlable hostname filter excludes blocked and non-crawlable hostnames', async () => {
    // Create crawlable hostname
    const random1 = Math.random().toString(36).slice(2, 15)
    const crawlableHostname = `dispatch-query-crawlable-${random1}.example.com`
    const url1 = await addUrl(user.id, `https://${crawlableHostname}/test`)
    await updateUrlHostname(url1!.hostname.id, { crawlable: true })

    // Create blocked hostname
    const random2 = Math.random().toString(36).slice(2, 15)
    const blockedHostname = `dispatch-query-blocked-${random2}.example.com`
    const url2 = await addUrl(user.id, `https://${blockedHostname}/test`)
    await updateUrlHostname(url2!.hostname.id, { crawlable: true })
    await updateUrlHostnameBlocked(url2!.hostname.id, true)

    // Create non-crawlable hostname
    const random3 = Math.random().toString(36).slice(2, 15)
    const nonCrawlableHostname = `dispatch-query-non-crawlable-${random3}.example.com`
    const url3 = await addUrl(user.id, `https://${nonCrawlableHostname}/test`)
    await updateUrlHostname(url3!.hostname.id, { crawlable: false })

    // Query directly to verify correct filtering (same query used by dispatchCrawlHostnames)
    const result = await getCrawlableHostnames([
      url1!.hostname.id,
      url2!.hostname.id,
      url3!.hostname.id,
    ])

    expect(result.length).toBe(1)
    expect(result[0].id).toBe(url1!.hostname.id)
  })
})
