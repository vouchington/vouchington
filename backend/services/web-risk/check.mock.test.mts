import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { upsertUrlHostnames } from '@services/urls-hostnames'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { getUrlHostnameByAny } from '@services/urls-hostnames/get'
import {
  overrideDynamicConfigFieldsForTest,
  getWebRiskHostnameAuditForTest,
  updateUrlHostnameBlocked,
} from '@voucha/test-helpers'

const fetchSpy = vi.fn<VitestLooseMock>()
vi.resetModules()
vi.doMock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: fetchSpy }
})

const originalApiKey = process.env.GOOGLE_WEB_RISK_API_KEY
process.env.GOOGLE_WEB_RISK_API_KEY = 'test-web-risk-key'

const { assertUrlAllowedByWebRisk } = await import('./check.mts')
const { configureWebRiskStateForTest, resetWebRiskStateForTest } = await import('./state.mts')
const { webRiskConfig } = await import('./config.mts')

describe('Google Web Risk checks', () => {
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

  it('skips Google calls when the feature flag is disabled', async () => {
    overrideDynamicConfigFieldsForTest(webRiskConfig, { enabled: false })

    await assertUrlAllowedByWebRisk(`https://disabled-${crypto.randomUUID()}.test/safe`)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('ignores invalid URLs', async () => {
    await assertUrlAllowedByWebRisk('not a url')

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not send private hostnames to Google', async () => {
    await assertUrlAllowedByWebRisk('http://localhost/private')
    await assertUrlAllowedByWebRisk('http://127.0.0.1/private')

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('blocks locally blocked hostnames even when the feature flag is disabled', async () => {
    overrideDynamicConfigFieldsForTest(webRiskConfig, { enabled: false })
    const domain = `local-block-${crypto.randomUUID()}.test`
    const hostnameMap = await upsertUrlHostnames(null, [domain])
    await updateUrlHostnameBlocked(hostnameMap.get(domain)!, true)

    await expect(assertUrlAllowedByWebRisk(`https://${domain}/blocked`)).rejects.toMatchObject({
      status: 400,
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('skips Google calls when a parent hostname has skip_web_risk enabled', async () => {
    const domain = `skip-${crypto.randomUUID()}.test`
    const hostnameMap = await upsertUrlHostnames(null, [domain])
    await updateUrlHostname(hostnameMap.get(domain)!, { skip_web_risk: true })

    await assertUrlAllowedByWebRisk(`https://www.${domain}/safe`)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('caches clean exact URL verdicts', async () => {
    const url = `https://clean-${crypto.randomUUID()}.test/page`
    fetchSpy.mockResolvedValueOnce(Response.json({}))

    await assertUrlAllowedByWebRisk(url)
    await assertUrlAllowedByWebRisk(url)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('fails open and cools down after Google rate limits', async () => {
    const firstUrl = `https://rate-limited-${crypto.randomUUID()}.test/page`
    const secondUrl = `https://rate-limited-${crypto.randomUUID()}.test/other`
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 429 }))

    await expect(assertUrlAllowedByWebRisk(firstUrl)).resolves.toBeUndefined()
    await expect(assertUrlAllowedByWebRisk(secondUrl)).resolves.toBeUndefined()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('runs local rate limit checks before calling Google', async () => {
    configureWebRiskStateForTest({
      bypassLocalRateLimits: false,
      minuteThreshold: 1,
    })
    fetchSpy.mockResolvedValueOnce(Response.json({}))

    await assertUrlAllowedByWebRisk(`https://local-rate-${crypto.randomUUID()}.test/page`)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fails open and cools down after Google request failures', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network unavailable'))

    await expect(
      assertUrlAllowedByWebRisk(`https://request-failure-${crypto.randomUUID()}.test/page`),
    ).resolves.toBeUndefined()
  })

  it('fails open on Google server errors', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('server error', { status: 500 }))

    await expect(
      assertUrlAllowedByWebRisk(`https://server-error-${crypto.randomUUID()}.test/page`),
    ).resolves.toBeUndefined()
  })

  it('fails open on Google client errors', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('bad request', { status: 400 }))

    await expect(
      assertUrlAllowedByWebRisk(`https://client-error-${crypto.randomUUID()}.test/page`),
    ).resolves.toBeUndefined()
  })

  it('fails open on invalid Google JSON', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('not-json', { status: 200 }))

    await expect(
      assertUrlAllowedByWebRisk(`https://bad-json-${crypto.randomUUID()}.test/page`),
    ).resolves.toBeUndefined()
  })

  it('blocks the registrable domain after a positive Google verdict', async () => {
    const domain = `risky-${crypto.randomUUID()}.test`
    fetchSpy.mockResolvedValueOnce(
      Response.json({
        threat: {
          threatTypes: ['MALWARE'],
          expireTime: '2030-01-01T00:00:00Z',
        },
      }),
    )

    await expect(assertUrlAllowedByWebRisk(`https://www.${domain}/bad`)).rejects.toMatchObject({
      status: 400,
    })

    const blocked = await getUrlHostnameByAny(domain)
    expect(blocked?.blocked).toBe(true)
    expect(blocked?.hostname).toBe(domain)

    const audit = await getWebRiskHostnameAuditForTest(domain)
    expect(audit).toMatchObject({
      blocked_source: 'google_web_risk',
      web_risk_checked_url: `https://www.${domain}/bad`,
      web_risk_threat_types: ['MALWARE'],
    })
    expect(audit?.web_risk_expire_at).toBeTruthy()
  })

  it('uses the local domain block instead of calling Google again', async () => {
    const domain = `repeat-risk-${crypto.randomUUID()}.test`
    fetchSpy.mockResolvedValueOnce(
      Response.json({
        threat: {
          threatTypes: ['SOCIAL_ENGINEERING'],
        },
      }),
    )

    await expect(assertUrlAllowedByWebRisk(`https://www.${domain}/bad`)).rejects.toMatchObject({
      status: 400,
    })
    await expect(assertUrlAllowedByWebRisk(`https://login.${domain}/again`)).rejects.toMatchObject({
      status: 400,
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
