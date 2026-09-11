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
