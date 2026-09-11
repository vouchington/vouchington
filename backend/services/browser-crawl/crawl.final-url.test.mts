import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCrawlTestDependencies,
  makeMockBrowser,
  makeMockPage,
  mockConnectOverCDP,
  resetCrawlMocks,
} from './crawl-test-helpers.mts'
import { resetBlockerForTesting } from './adblocker-cache.mts'
import { crawlWithBrowser } from './crawl.mts'

describe('crawlWithBrowser finalUrl capture', () => {
  beforeEach(() => resetCrawlMocks(resetBlockerForTesting))

  afterEach(() => {
    delete process.env.LIGHTPANDA_CDP_URL
    delete process.env.LIGHTPANDA_TOKEN
  })

  function crawlWithBrowserForTest(url: string) {
    return crawlWithBrowser(url, getCrawlTestDependencies())
  }

  it('captures the post-redirect landed URL as finalUrl', async () => {
    process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
    process.env.LIGHTPANDA_TOKEN = 'test-token'
    const inputUrl = 'https://americanexpress.com/en-us/referral/all-cards?ref=JONATOycVU'
    const landedUrl =
      'https://www.americanexpress.com/en-us/credit-cards/referral/prospect/all-cards/personal?CORID=abc&GENCODE=def&ref=JONATOycVU'

    // page.url() only starts returning landedUrl once goto() has resolved — before that it
    // still reports the pre-navigation inputUrl, exactly like a real browser mid-navigation.
    // A mock that always returns landedUrl (the prior version of this test) would pass even
    // if crawlWithBrowser read page.url() before awaiting goto(), capturing a stale
    // pre-navigation URL against a real browser.
    let navigated = false
    const page = makeMockPage({
      goto: vi.fn<VitestLooseMock>().mockImplementation(async () => {
        navigated = true
        return { status: () => 200 }
      }),
      url: vi.fn<VitestLooseMock>().mockImplementation(() => (navigated ? landedUrl : inputUrl)),
    })
    mockConnectOverCDP.mockResolvedValue(makeMockBrowser(page))
    const result = await crawlWithBrowserForTest(inputUrl)

    expect(page.goto).toHaveBeenCalledWith(inputUrl, expect.objectContaining({ waitUntil: 'load' }))
    expect(result.finalUrl).toBe(landedUrl)
  })
})
