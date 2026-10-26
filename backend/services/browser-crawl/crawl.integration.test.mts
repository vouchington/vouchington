import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crawlWithBrowser } from './crawl.mts'

/** Retained live cloud smoke check, selected only by the credentialed CI project. */
describe('crawlWithBrowser (Lightpanda cloud)', () => {
  let originalCdpUrl: string | undefined

  beforeAll(() => {
    originalCdpUrl = process.env.LIGHTPANDA_CDP_URL
  })

  afterAll(() => {
    if (originalCdpUrl !== undefined) {
      process.env.LIGHTPANDA_CDP_URL = originalCdpUrl
    } else {
      delete process.env.LIGHTPANDA_CDP_URL
    }
  })

  // A live Lightpanda session can exceed the default budget during external service latency.
  it(
    'crawls a real page over the live Lightpanda cloud SaaS',
    /* no-mistakes: integration=http */
    async () => {
      if (!process.env.LIGHTPANDA_TOKEN?.trim()) {
        throw new Error('LIGHTPANDA_TOKEN is required for the selected Lightpanda cloud test')
      }
      // Unconditional, not `??=`: local dev's .env may already export a stale
      // LIGHTPANDA_CDP_URL (or a future non-cloud value); this test must always
      // exercise the real cloud endpoint regardless of ambient environment state.
      process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
      const result = await crawlWithBrowser('https://example.com/')
      expect(result.statusCode).toBe(200)
      expect(result.hasContent).toBe(true)
      expect(result.title.length).toBeGreaterThan(0)
    },
    30_000,
  )
})
