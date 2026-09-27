import { beforeEach, describe, expect, it } from 'vitest'
import { WebIntegrationClient } from '../helpers/client.mts'
import { SEEDED_IDS } from '../helpers/constants.mts'
import {
  expectBreadcrumbHtml,
  expectNoBlankExternalLinksWithoutRel,
  findSchema,
  getJsonLd,
  parseHtml,
} from '../helpers/html-assertions.mts'

const workerOrigin = process.env.WEB_INTEGRATION_WORKER_ORIGIN
const traceOrigin = process.env.WEB_INTEGRATION_TRACE_ORIGIN
const artifactsDir = process.env.WEB_INTEGRATION_ARTIFACTS_DIR

if (!workerOrigin || !traceOrigin || !artifactsDir) {
  throw new Error('Web integration environment is not configured')
}

let client: WebIntegrationClient

describe('web static SEO tests', () => {
  beforeEach(() => {
    client = new WebIntegrationClient(workerOrigin, traceOrigin, artifactsDir)
  })

  describe('static SEO routes and link contracts', () => {
    it('health page exposes the readiness response', async () => {
      const result = await client.loadPage('/healthz', 'route-healthz')
      expect(result.response.status).toBe(200)
      expect(
        Array.from(
          parseHtml(result.html, result.response.url).querySelectorAll('span'),
          span => span.textContent,
        ),
      ).toContain('ok')
    })

    it('counter-notice information states the statutory requirements', async () => {
      const result = await client.loadPage('/copyright/counter-notice', 'route-counter-notice')
      const document = parseHtml(result.html, result.response.url)
      expect(result.response.status).toBe(200)
      expect(document.querySelector('h1')?.textContent).toBe('Counter-notice and restoration')
      expect(document.body.textContent).toContain('consent to federal jurisdiction')
      expect(document.body.textContent).toContain(
        'qualifying court or Copyright Claims Board notice',
      )
      expect(document.querySelector('main a[href="/copyright"]')?.textContent).toBe(
        'Copyright policy',
      )
    })

    it('designated-agent information keeps the unregistered program explicit', async () => {
      const result = await client.loadPage('/copyright/designated-agent', 'route-designated-agent')
      const document = parseHtml(result.html, result.response.url)
      expect(result.response.status).toBe(200)
      expect(document.querySelector('h1')?.textContent).toBe('Designated agent status')
      expect(document.body.textContent).toContain('not yet registered')
      expect(document.body.textContent).toContain('Do not send a statutory DMCA notice')
    })

    it('repeat-infringer policy retains human review and disabled intake', async () => {
      const result = await client.loadPage(
        '/copyright/repeat-infringer-policy',
        'route-repeat-infringer',
      )
      const document = parseHtml(result.html, result.response.url)
      expect(result.response.status).toBe(200)
      expect(document.querySelector('h1')?.textContent).toBe('Repeat-infringer policy')
      expect(document.body.textContent).toContain('Copyright intake stays off')
      expect(document.body.textContent).toContain(
        'A notice count does not suspend or delete an account',
      )
      expect(document.querySelectorAll('main li')).toHaveLength(5)
    })
    it('robots.txt contains required directives', async () => {
      const response = await client.request('/robots.txt')
      const body = await response.text()

      expect(response.status).toBe(200)
      expect(body).toContain('Allow: /')
      for (const path of ['/admin/', '/api/', '/auth/', '/feed/', '/login', '/my/']) {
        expect(body).toContain(`Disallow: ${path}`)
      }
      expect(body).not.toContain('Disallow: /md/')
      expect(body).not.toContain('Crawl-delay:')
      expect(body).toContain('Sitemap:')
      expect(body).toContain('/sitemap.xml')
    })

    it('/domains and /sources have no unsafe blank external links', async () => {
      await Promise.all(
        ['/domains', '/sources'].map(async path => {
          const result = await client.loadPage(path, `seo-external-links-${path.slice(1)}`)
          expectNoBlankExternalLinksWithoutRel(parseHtml(result.html, result.response.url))
        }),
      )
    })

    it('static public pages render expected content in HTML', async () => {
      const plans = await client.loadPage('/plans', 'seo-plans-content')
      const plansText = parseHtml(plans.html, plans.response.url).body.textContent ?? ''
      for (const text of [
        'Compare Plans',
        'Free',
        'Plus',
        'Pro',
        'Frequently Asked Questions',
        'Can I change plans later?',
        'Why do free accounts have a 7-day wait?',
      ]) {
        expect(plansText).toContain(text)
      }
    })

    it('seeded post detail breadcrumbs include BreadcrumbList schema', async () => {
      const result = await client.loadPage(`/review/${SEEDED_IDS.review}`, 'seo-review-breadcrumbs')
      const document = parseHtml(result.html, result.response.url)
      expectBreadcrumbHtml(document)
      expect(findSchema(getJsonLd(document), 'BreadcrumbList')).toBeTruthy()
    })
  })
})
