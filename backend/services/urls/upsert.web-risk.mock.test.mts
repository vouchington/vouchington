import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { overrideDynamicConfigFieldsForTest, urlExistsForTest } from '@voucha/test-helpers'

// Relocated from @services/web-risk (pure test-only usage of @services/urls'
// addUrl) so that web-risk's test suite doesn't need to depend on
// @services/urls, which would create a workspace cycle (urls already depends
// on web-risk in production, via assertUrlAllowedByWebRisk in upsert.mts).

const fetchSpy = vi.fn<VitestLooseMock>()
vi.resetModules()
vi.doMock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

const originalApiKey = process.env.GOOGLE_WEB_RISK_API_KEY
process.env.GOOGLE_WEB_RISK_API_KEY = 'test-web-risk-key'

const { addUrl } = await import('./upsert.mts')
const { configureWebRiskStateForTest, resetWebRiskStateForTest } =
  await import('@services/web-risk/state')
const { webRiskConfig } = await import('@services/web-risk/config')

describe('addUrl integrates with Google Web Risk blocking', () => {
  beforeEach(async () => {
    process.env.GOOGLE_WEB_RISK_API_KEY = 'test-web-risk-key'
    configureWebRiskStateForTest({ bypassLocalRateLimits: true })
    await webRiskConfig.waitForInitialization()
    overrideDynamicConfigFieldsForTest(webRiskConfig, { enabled: true })
    fetchSpy.mockReset()
  })

  afterEach(async () => {
    try {
      await resetWebRiskStateForTest()
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.GOOGLE_WEB_RISK_API_KEY
      } else {
        process.env.GOOGLE_WEB_RISK_API_KEY = originalApiKey
      }
    }
  })

  it('rejects risky URLs before writing URL rows', async () => {
    const domain = `prewrite-risk-${crypto.randomUUID()}.test`
    const url = `https://${domain}/bad`
    fetchSpy.mockResolvedValueOnce(
      Response.json({
        threat: {
          threatTypes: ['MALWARE'],
        },
      }),
    )

    await expect(addUrl(null, url)).rejects.toMatchObject({ status: 400 })

    expect(await urlExistsForTest(url)).toBe(false)
  })
})
