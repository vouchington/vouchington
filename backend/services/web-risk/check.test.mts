import { Request as UndiciRequest, Response as UndiciResponse } from 'undici'
import { describe, expect, it } from 'vitest'
import { upsertUrlHostnames } from '@services/urls-hostnames'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { getUrlHostnameByAny } from '@services/urls-hostnames/get'
import { getWebRiskHostnameAuditForTest, updateUrlHostnameBlocked } from '@voucha/test-helpers'
import { withGoogleWebRiskTest } from '@voucha/test-helpers/web-risk-state'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'

describe('Google Web Risk checks', () => {
  it('skips Google calls when the feature flag is disabled', () =>
    withGoogleWebRiskTest(async context => {
      context.setEnabled(false)

      await context.fixture.check(`https://disabled-${crypto.randomUUID()}.test/safe`)

      expect(context.fetchSpy).not.toHaveBeenCalled()
    }))

  it('ignores invalid URLs', () =>
    withGoogleWebRiskTest(async context => {
      await context.fixture.check('not a url')

      expect(context.fetchSpy).not.toHaveBeenCalled()
    }))

  it('does not send private hostnames to Google', () =>
    withGoogleWebRiskTest(async context => {
      await context.fixture.check('http://localhost/private')
      await context.fixture.check('http://127.0.0.1/private')

      expect(context.fetchSpy).not.toHaveBeenCalled()
    }))

  it('blocks locally blocked hostnames even when the feature flag is disabled', () =>
    withGoogleWebRiskTest(async context => {
      context.setEnabled(false)
      const domain = `local-block-${crypto.randomUUID()}.test`
      const hostnameMap = await upsertUrlHostnames(null, [domain])
      await updateUrlHostnameBlocked(hostnameMap.get(domain)!, true)

      await expect(context.fixture.check(`https://${domain}/blocked`)).rejects.toMatchObject({
        status: 400,
      })
      expect(context.fetchSpy).not.toHaveBeenCalled()
    }))

  it('skips Google calls when a parent hostname has should_skip_web_risk enabled', () =>
    withGoogleWebRiskTest(async context => {
      const domain = `skip-${crypto.randomUUID()}.test`
      const hostnameMap = await upsertUrlHostnames(null, [domain])
      await updateUrlHostname(hostnameMap.get(domain)!, { should_skip_web_risk: true })

      await context.fixture.check(`https://www.${domain}/safe`)

      expect(context.fetchSpy).not.toHaveBeenCalled()
    }))

  it('caches clean exact URL verdicts', () =>
    withGoogleWebRiskTest(async context => {
      const url = `https://clean-${crypto.randomUUID()}.test/page`
      context.fetchSpy.mockResolvedValueOnce(UndiciResponse.json({}))

      await context.fixture.check(url)
      await context.fixture.check(url)

      expect(context.fetchSpy).toHaveBeenCalledTimes(1)
      const [request, options] = context.fetchSpy.mock.calls[0]!
      const requestUrl =
        request instanceof URL
          ? request
          : request instanceof UndiciRequest
            ? new URL(request.url)
            : new URL(request)
      expect(requestUrl.origin).toBe('https://webrisk.googleapis.com')
      expect(requestUrl.searchParams.get('uri')).toBe(url)
      expect(requestUrl.searchParams.get('key')).toBe('test-web-risk-key')
      expect(requestUrl.searchParams.getAll('threatTypes')).toEqual([
        'MALWARE',
        'SOCIAL_ENGINEERING',
        'UNWANTED_SOFTWARE',
        'SOCIAL_ENGINEERING_EXTENDED_COVERAGE',
      ])
      expect(options?.dispatcher).toBe(getExternalRequestDispatcher())
      expect(options?.signal).toBeInstanceOf(AbortSignal)
    }))

  it('fails open and cools down after Google rate limits', () =>
    withGoogleWebRiskTest(async context => {
      const firstUrl = `https://rate-limited-${crypto.randomUUID()}.test/page`
      const secondUrl = `https://rate-limited-${crypto.randomUUID()}.test/other`
      context.fetchSpy.mockResolvedValueOnce(new UndiciResponse(null, { status: 429 }))

      await expect(context.fixture.check(firstUrl)).resolves.toBeUndefined()
      await expect(context.fixture.check(secondUrl)).resolves.toBeUndefined()

      expect(context.fetchSpy).toHaveBeenCalledTimes(1)
      await expect(context.fixture.state.isProviderCoolingDown()).resolves.toBe(true)
      expect(await context.fixture.ttl(context.fixture.cooldownKey())).toBeGreaterThan(55_000)
      await expect(context.fixture.countWindow(context.fixture.windowKeys()[1])).resolves.toBe(1)
    }))

  it('runs local rate limit checks before calling Google', () =>
    withGoogleWebRiskTest(async context => {
      const fixture = context.ownFixture({ minuteThreshold: 1 })
      context.fetchSpy.mockResolvedValueOnce(UndiciResponse.json({}))

      await fixture.check(`https://local-rate-${crypto.randomUUID()}.test/page`)

      expect(context.fetchSpy).not.toHaveBeenCalled()
    }))

  it('fails open and cools down after Google request failures', () =>
    withGoogleWebRiskTest(async context => {
      context.fetchSpy.mockRejectedValueOnce(new Error('network unavailable'))

      await expect(
        context.fixture.check(`https://request-failure-${crypto.randomUUID()}.test/page`),
      ).resolves.toBeUndefined()
      await expect(context.fixture.state.isProviderCoolingDown()).resolves.toBe(true)
      expect(await context.fixture.ttl(context.fixture.cooldownKey())).toBeGreaterThan(5000)
      await context.fixture.check(`https://cooldown-${crypto.randomUUID()}.test/page`)
      expect(context.fetchSpy).toHaveBeenCalledTimes(1)
    }))

  it('fails open on Google server errors', () =>
    withGoogleWebRiskTest(async context => {
      const response = new UndiciResponse('server error', { status: 500 })
      context.fetchSpy.mockResolvedValueOnce(response)

      await expect(
        context.fixture.check(`https://server-error-${crypto.randomUUID()}.test/page`),
      ).resolves.toBeUndefined()
      expect(context.fetchSpy).toHaveBeenCalledTimes(1)
      await expect(response.body!.getReader().read()).resolves.toMatchObject({ done: true })
      await expect(context.fixture.state.isProviderCoolingDown()).resolves.toBe(true)
    }))

  it('fails open on Google client errors', () =>
    withGoogleWebRiskTest(async context => {
      const response = new UndiciResponse('bad request', { status: 400 })
      context.fetchSpy.mockResolvedValueOnce(response)

      await expect(
        context.fixture.check(`https://client-error-${crypto.randomUUID()}.test/page`),
      ).resolves.toBeUndefined()
      expect(context.fetchSpy).toHaveBeenCalledTimes(1)
      await expect(response.body!.getReader().read()).resolves.toMatchObject({ done: true })
      await expect(context.fixture.state.isProviderCoolingDown()).resolves.toBe(true)
    }))

  it('fails open on invalid Google JSON', () =>
    withGoogleWebRiskTest(async context => {
      context.fetchSpy.mockResolvedValueOnce(new UndiciResponse('not-json', { status: 200 }))

      await expect(
        context.fixture.check(`https://bad-json-${crypto.randomUUID()}.test/page`),
      ).resolves.toBeUndefined()
      expect(context.fetchSpy).toHaveBeenCalledTimes(1)
      await expect(context.fixture.state.isProviderCoolingDown()).resolves.toBe(true)
    }))

  it('blocks the registrable domain after a positive Google verdict', () =>
    withGoogleWebRiskTest(async context => {
      const domain = `risky-${crypto.randomUUID()}.test`
      context.fetchSpy.mockResolvedValueOnce(
        UndiciResponse.json({
          threat: {
            threatTypes: ['MALWARE'],
            expireTime: '2030-01-01T00:00:00Z',
          },
        }),
      )

      await expect(context.fixture.check(`https://www.${domain}/bad`)).rejects.toMatchObject({
        status: 400,
      })

      const blocked = await getUrlHostnameByAny(domain)
      expect(blocked?.is_blocked).toBe(true)
      expect(blocked?.hostname).toBe(domain)

      const audit = await getWebRiskHostnameAuditForTest(domain)
      expect(audit).toMatchObject({
        blocked_source: 'google_web_risk',
        web_risk_checked_url: `https://www.${domain}/bad`,
        web_risk_threat_types: ['MALWARE'],
      })
      expect(audit?.web_risk_expire_at).toBeTruthy()
    }))

  it('uses the local domain block instead of calling Google again', () =>
    withGoogleWebRiskTest(async context => {
      const domain = `repeat-risk-${crypto.randomUUID()}.test`
      context.fetchSpy.mockResolvedValueOnce(
        UndiciResponse.json({
          threat: {
            threatTypes: ['SOCIAL_ENGINEERING'],
          },
        }),
      )

      await expect(context.fixture.check(`https://www.${domain}/bad`)).rejects.toMatchObject({
        status: 400,
      })
      await expect(context.fixture.check(`https://login.${domain}/again`)).rejects.toMatchObject({
        status: 400,
      })

      expect(context.fetchSpy).toHaveBeenCalledTimes(1)
    }))

  it('makes another paid lookup after invalidating the exact clean cache key', () =>
    withGoogleWebRiskTest(async context => {
      const url = new URL(`https://expired-${crypto.randomUUID()}.test/page`)
      context.fetchSpy.mockResolvedValueOnce(UndiciResponse.json({}))
      await context.fixture.check(url.toString())
      const key = context.fixture.cleanKey(url)
      expect(await context.fixture.ttl(key)).toBeGreaterThan(7 * 24 * 60 * 60 * 1000 - 5000)
      await context.fixture.invalidateCleanVerdict(url)
      await expect(
        context.fixture.own(context.fixture.state.hasCleanCachedVerdict(url)),
      ).resolves.toBe(false)
      context.fetchSpy.mockResolvedValueOnce(UndiciResponse.json({}))

      await context.fixture.check(url.toString())

      expect(context.fetchSpy).toHaveBeenCalledTimes(2)
      await expect(context.fixture.countWindow(context.fixture.windowKeys()[1])).resolves.toBe(2)
    }))

  it('honors a 403 Retry-After without charging a second lookup during cooldown', () =>
    withGoogleWebRiskTest(async context => {
      context.fetchSpy.mockResolvedValueOnce(
        new UndiciResponse(null, {
          status: 403,
          headers: { 'retry-after': '2' },
        }),
      )
      await context.fixture.check(`https://quota-${crypto.randomUUID()}.test/page`)
      expect(await context.fixture.ttl(context.fixture.cooldownKey())).toBeGreaterThan(1500)

      await context.fixture.check(`https://quota-${crypto.randomUUID()}.test/other`)

      expect(context.fetchSpy).toHaveBeenCalledTimes(1)
      await expect(context.fixture.countWindow(context.fixture.windowKeys()[1])).resolves.toBe(1)
    }))
})
