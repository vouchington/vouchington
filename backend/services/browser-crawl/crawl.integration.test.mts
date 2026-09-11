import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crawlWithBrowser } from './crawl.mts'

/**
 * Real, non-mocked check that the Lightpanda cloud SaaS connection actually works:
 * connects over CDP, navigates, and extracts content. Gated on LIGHTPANDA_TOKEN so
 * it only runs when a real credential is present (locally via ~/voucha.env, or in
 * CI only where the secret has been explicitly provided) — it never burns free-tier
 * hours on a routine push.
 */
describe('crawlWithBrowser (Lightpanda cloud)', () => {
  const hasLightpandaToken = Boolean(process.env.LIGHTPANDA_TOKEN)
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

  it.skipIf(!hasLightpandaToken)(
    'crawls a real page over the live Lightpanda cloud SaaS',
    /* no-mistakes: integration=http */
    async () => {
      // Unconditional, not `??=`: local dev's .env may already export a stale
      // LIGHTPANDA_CDP_URL (or a future non-cloud value); this test must always
      // exercise the real cloud endpoint regardless of ambient environment state.
      process.env.LIGHTPANDA_CDP_URL = 'wss://uswest.cloud.lightpanda.io/ws'
      const result = await crawlWithBrowser('https://www.google.com/')
      expect(result.statusCode).toBe(200)
      expect(result.hasContent).toBe(true)
      expect(result.title.length).toBeGreaterThan(0)
    },
    60_000,
  )
})
