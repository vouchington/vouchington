import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUserDirect,
  createReferralProgramFixture,
  insertTestUrlHostname,
  insertTestUrl,
} from '@voucha/test-helpers'
import { createCrawler } from './create-crawler.mts'
import { getCrawlerForReferralProgram } from './get-for-referral-program.mts'

// Uses insertTestUrlHostname/insertTestUrl (not addUrl from @services/urls/upsert) because
// @services/urls already depends on @services/crawlers for real (getOrCreateCrawlerForHostname),
// so services/crawlers must not depend back on @services/urls for tests.
async function createTestUrlWithNewHostname(
  url: string,
): Promise<{ id: string; hostname: { id: string } }> {
  const hostname = new URL(url).hostname
  const hostnameId = await insertTestUrlHostname({ hostname })
  const id = await insertTestUrl({ url, hostnameId })
  return { id, hostname: { id: hostnameId } }
}

describe('get-for-referral-program', () => {
  let userId: string

  beforeAll(async () => {
    const user = await createTestUserDirect()
    userId = user!.id
  })

  it('falls back to hostname crawler when no program-specific crawler exists', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const fixture = await createReferralProgramFixture({
      createdById: userId,
      randomSuffix: suffix,
      hostname: `get-rp-fallback-${suffix}.example.com`,
    })
    const url = await createTestUrlWithNewHostname(
      `https://get-rp-fallback-${suffix}.example.com/ref/abc`,
    )

    const crawler = await getCrawlerForReferralProgram(url!.hostname.id, fixture.referralProgramId)

    expect(crawler).toBeDefined()
    expect(crawler.referral_program_id).toBeNull()
    expect(crawler.hostname_id).toBe(url!.hostname.id)
  })

  it('returns program-specific crawler when one is configured for the same hostname', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const fixture = await createReferralProgramFixture({
      createdById: userId,
      randomSuffix: suffix,
      hostname: `get-rp-specific-${suffix}.example.com`,
    })
    const url = await createTestUrlWithNewHostname(
      `https://get-rp-specific-${suffix}.example.com/ref/abc`,
    )

    // Create a program-specific crawler
    const programCrawler = await createCrawler(null, {
      hostname_id: url!.hostname.id,
      referral_program_id: fixture.referralProgramId,
      crawler_type: 'automation',
      content_selectors: ['.offer-section'],
      css_selectors_to_remove: ['.nav'],
      priority: 10,
    })

    const resolved = await getCrawlerForReferralProgram(url!.hostname.id, fixture.referralProgramId)

    expect(resolved.id).toBe(programCrawler.id)
    expect(resolved.referral_program_id).toBe(fixture.referralProgramId)
    expect(resolved.crawler_type).toBe('automation')
    expect(resolved.content_selectors).toEqual(['.offer-section'])
  })
})
