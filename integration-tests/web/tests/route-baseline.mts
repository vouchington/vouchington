import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { WebIntegrationClient } from '../helpers/client.mts'
import { PLAYWRIGHT_CHROME_UA, TEST_USER_USERNAME } from '../helpers/constants.mts'
import { parseHtml } from '../helpers/html-assertions.mts'
import {
  authenticateTestUserWithDirectSessionTokens,
  expectManualRedirectMatches,
  expectManualRedirectPath,
  getManualRedirectLocation,
} from '../helpers/routing-assertions.mts'

const workerOrigin = process.env.WEB_INTEGRATION_WORKER_ORIGIN
const traceOrigin = process.env.WEB_INTEGRATION_TRACE_ORIGIN
const artifactsDir = process.env.WEB_INTEGRATION_ARTIFACTS_DIR
const SEEDED_COMMUNITY_SLUG = 'playwright-popular-community'

if (!workerOrigin || !traceOrigin || !artifactsDir) {
  throw new Error('Web integration environment is not configured')
}

let client: WebIntegrationClient

describe('web route baseline tests', () => {
  beforeEach(() => {
    client = new WebIntegrationClient(workerOrigin, traceOrigin, artifactsDir)
  })

  describe('route coverage baseline', () => {
    it('covers redirect-only public routes', async () => {
      await expectManualRedirectPath(
        client,
        workerOrigin,
        '/keyboard-shortcuts',
        '/article/keyboard-shortcuts',
      )
      await expectManualRedirectPath(client, workerOrigin, '/notification-redirect', '/')
      await expectManualRedirectMatches(
        client,
        `/communities/${SEEDED_COMMUNITY_SLUG}/apply`,
        /\/login(?:\?|$)/,
      )
      await expectManualRedirectMatches(
        client,
        '/communities/invite/does-not-exist',
        /\/login(?:\?|$)/,
      )
    })

    it('covers public 404 routes', async () => {
      const communitySlug = randomUUID()

      await Promise.all(
        [
          '/compare/not-a-topic-vs-other-topic',
          `/card/${randomUUID()}/latest`,
          `/communities/${communitySlug}/news`,
          '/trending',
          '/this-page-definitely-does-not-exist-abc123',
        ].map(async path => {
          const response = await client.request(path)
          expect(response.status).toBe(404)
        }),
      )
    })

    it('covers owner-private user routes that redirect to /my/*', async () => {
      await Promise.all(
        [
          `/user/coverage-does-not-exist/topics/muted`,
          `/user/coverage-does-not-exist/topics/viewed`,
          `/user/coverage-does-not-exist/users/blocked`,
          `/user/coverage-does-not-exist/users/muted`,
          `/user/${TEST_USER_USERNAME}/topics/blocked`,
        ].map(async path => {
          await expectManualRedirectMatches(client, path, /^\/my\//)
        }),
      )
    })

    it('checks community lists redirect without following it', async () => {
      const location = await getManualRedirectLocation(
        client,
        `/communities/${SEEDED_COMMUNITY_SLUG}/lists`,
      )
      expect(new URL(location, workerOrigin).pathname).toMatch(
        new RegExp(`^/communities/${SEEDED_COMMUNITY_SLUG}/lists(?:/topics)?$`),
      )
    })

    it('covers OAuth callback loading pages', async () => {
      await Promise.all(
        ['apple', 'github', 'linkedin', 'microsoft', 'x'].map(async provider => {
          const query = provider === 'apple' ? 'id_token=coverage' : 'code=coverage'
          const result = await client.loadPage(
            `/auth/callback/${provider}?${query}`,
            `route-auth-callback-${provider}`,
          )
          expect(result.html).toContain('Completing sign in...')
        }),
      )
    })

    it('covers authenticated route baselines', async () => {
      await authenticateTestUserWithDirectSessionTokens(client)

      const valkeyAdmin = await client.loadPage('/admin/valkey', 'route-admin-valkey', {
        userAgent: PLAYWRIGHT_CHROME_UA,
      })
      expect(valkeyAdmin.response.status).toBe(200)
      expect(parseHtml(valkeyAdmin.html, valkeyAdmin.response.url).body.textContent).toContain(
        'Valkey',
      )

      const supportContacts = await client.loadPage(
        '/support/contacts',
        'route-admin-support-contacts',
        { userAgent: PLAYWRIGHT_CHROME_UA },
      )
      expect(supportContacts.response.status).toBe(200)
      expect(
        parseHtml(supportContacts.html, supportContacts.response.url).body.textContent,
      ).toContain('Support Contacts')

      const newsImportExport = await client.loadPage(
        '/my/news-sources/import-export',
        'route-my-news-sources-import-export',
        { userAgent: PLAYWRIGHT_CHROME_UA },
      )
      expect(newsImportExport.response.status).toBe(200)
      expect(
        parseHtml(newsImportExport.html, newsImportExport.response.url).body.textContent,
      ).toContain('Import/Export News Sources')

      const markdown = await client.loadPage('/test-markdown-html', 'route-test-markdown-html', {
        userAgent: PLAYWRIGHT_CHROME_UA,
      })
      expect(markdown.response.status).toBe(200)
      expect(parseHtml(markdown.html, markdown.response.url).body.textContent).toContain(
        'Markdown HTML Rendering Test',
      )
    })

    it('covers authenticated 404 route baselines', async () => {
      await authenticateTestUserWithDirectSessionTokens(client)

      await Promise.all(
        [
          `/support/contacts/${randomUUID()}`,
          `/agent/${randomUUID()}/conversation/${randomUUID()}`,
          `/topic-recommendations/${randomUUID()}/edit`,
        ].map(async path => {
          const response = await client.request(path, { userAgent: PLAYWRIGHT_CHROME_UA })
          expect(response.status).toBe(404)
        }),
      )
    })
  })
})
