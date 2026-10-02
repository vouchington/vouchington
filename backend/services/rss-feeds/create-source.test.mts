import dns from 'node:dns'
import { describe, expect, it, vi } from 'vitest'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { MockAgent, withMockAgentDefaultFetchForTest } from '@voucha/test-helpers/provider-http'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { getUrlByAny } from '@services/urls/get'
import { getRssFeedByUrlId } from './get.mts'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { createSourceFromUrl } from './create-source.mts'

describe('source creation canonical mapping failure', () => {
  it('creates the redirected source while reporting a failed best-effort canonical mapping', async () => {
    const suffix = crypto.randomUUID()
    const hostname = `rss-recovery-${suffix}.example.com`
    const origin = `https://${hostname}`
    const originalUrl = `${origin}/original.xml`
    const targetUrl = `${origin}/feed.xml`
    const user = await createTestUser()
    const agent = new MockAgent()
    agent.disableNetConnect()
    agent
      .get(origin)
      .intercept({ path: '/original.xml', method: 'GET' })
      .reply(301, '', {
        headers: { location: targetUrl },
      })
    agent
      .get(origin)
      .intercept({ path: '/feed.xml', method: 'GET' })
      .reply(
        200,
        `<?xml version="1.0"?><rss version="2.0"><channel><title>Owned RSS ${suffix}</title><link>${origin}/</link><description>Owned feed</description><item><title>Owned article</title><link>${origin}/article</link><guid>${suffix}</guid></item></channel></rss>`,
        { headers: { 'content-type': 'application/rss+xml' } },
      )
    const originalLookup = dns.promises.lookup
    const lookup = vi.spyOn(dns.promises, 'lookup').mockImplementation(
      vi.fn<VitestLooseMock>(async (requestedHostname: string, options?: unknown) => {
        if (requestedHostname === hostname) {
          const address = { address: '93.184.216.34', family: 4 }
          return typeof options === 'object' &&
            options !== null &&
            'all' in options &&
            options.all === true
            ? [address]
            : address
        }
        return Reflect.apply(originalLookup, dns.promises, [requestedHostname, options])
      }),
    )
    const firstCapture = sentryCaptureExceptionMock.mock.calls.length
    try {
      const { result, error } = await withMockAgentDefaultFetchForTest(agent, () =>
        withPostgresPoolQueryFailureForTest('/* setCanonicalUrl */', async () => {
          const created = await createSourceFromUrl(user, WEB_PROVENANCE, originalUrl, {
            follow: false,
          })
          await vi.waitFor(() => {
            expect(
              sentryCaptureExceptionMock.mock.calls
                .slice(firstCapture)
                .some(
                  ([captured]) =>
                    captured instanceof Error && 'code' in captured && captured.code === '25P02',
                ),
            ).toBe(true)
          })
          return created
        }),
      )

      expect(error).toMatchObject({ code: '25P02' })
      expect(result.status).toBe('created')
      expect(sentryCaptureExceptionMock.mock.calls.some(([captured]) => captured === error)).toBe(
        true,
      )
      expect(await getUrlByAny(originalUrl)).toMatchObject({ canonical_url_id: null })
      const target = await getUrlByAny(targetUrl)
      if (!target) throw new Error('The owned redirected feed URL was not persisted')
      expect(await getRssFeedByUrlId(target.id)).toEqual({ id: result.rss_feed_id })
      agent.assertNoPendingInterceptors()
    } finally {
      lookup.mockRestore()
      await agent.close()
    }
  })
})
