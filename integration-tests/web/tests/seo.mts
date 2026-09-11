import { beforeEach, describe, expect, it } from 'vitest'
import { WebIntegrationClient } from '../helpers/client.mts'
import {
  expectBreadcrumbHtml,
  findSchema,
  getJsonLd,
  getLinkHref,
  getMetaContent,
  parseHtml,
} from '../helpers/html-assertions.mts'
import { TEST_USER_USERNAME } from '../helpers/constants.mts'

const workerOrigin = process.env.WEB_INTEGRATION_WORKER_ORIGIN
const traceOrigin = process.env.WEB_INTEGRATION_TRACE_ORIGIN
const artifactsDir = process.env.WEB_INTEGRATION_ARTIFACTS_DIR

if (!workerOrigin || !traceOrigin || !artifactsDir) {
  throw new Error('Web integration environment is not configured')
}

let client: WebIntegrationClient

describe('web SEO tests', () => {
  beforeEach(() => {
    client = new WebIntegrationClient(workerOrigin, traceOrigin, artifactsDir)
  })

  const publicPages = [
    '/',
    '/reviews',
    '/discussions',
    '/topics',
    '/cards',
    '/domains',
    '/sources',
    '/communities',
    '/stories',
    '/plans',
    '/login',
  ] as const

  function artifactSlug(path: string): string {
    return path === '/' ? 'home' : path.replaceAll('/', '-').replace(/^-+/, '')
  }

  describe('public SEO metadata', () => {
    it.each(publicPages)('%s has non-empty title and description', async path => {
      const result = await client.loadPage(path, `seo-metadata-${artifactSlug(path)}`)
      const document = parseHtml(result.html, result.response.url)

      expect(document.title.trim().length).toBeGreaterThan(0)
      expect(getMetaContent(document, 'meta[name="description"]').length).toBeGreaterThan(0)
    })

    it.each(publicPages.filter(path => path !== '/login'))(
      '%s has canonical and Open Graph metadata',
      async pagePath => {
        const result = await client.loadPage(pagePath, `seo-og-${artifactSlug(pagePath)}`)
        const document = parseHtml(result.html, result.response.url)

        expect(getLinkHref(document, 'link[rel="canonical"]').length).toBeGreaterThan(0)
        expect(getMetaContent(document, 'meta[property="og:title"]').length).toBeGreaterThan(0)
        expect(getMetaContent(document, 'meta[property="og:description"]').length).toBeGreaterThan(
          0,
        )
      },
    )

    it('/login is noindex', async () => {
      const result = await client.loadPage('/login', `seo-noindex-login`)
      const document = parseHtml(result.html, result.response.url)
      expect(getMetaContent(document, 'meta[name="robots"]')).toMatch(/noindex/i)
    })
  })

  describe('structured data', () => {
    it('renders SiteNavigationElement without BreadcrumbList for anonymous plans visits', async () => {
      const result = await client.loadPage('/plans', 'seo-plans-structured-data')
      const schemas = getJsonLd(parseHtml(result.html, result.response.url))

      const siteNavigationSchema = findSchema<{ name: string; hasPart: unknown[] }>(
        schemas,
        'SiteNavigationElement',
      )
      const breadcrumbSchema = findSchema(schemas, 'BreadcrumbList')

      expect(siteNavigationSchema).toBeTruthy()
      expect(siteNavigationSchema?.name).toBe('Primary navigation')
      expect(siteNavigationSchema?.hasPart).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'News', url: 'https://voucha.ai/news' }),
          expect.objectContaining({ name: 'Domains', url: 'https://voucha.ai/domains' }),
        ]),
      )
      expect(breadcrumbSchema).toBeUndefined()
    })

    it('renders profile metadata and JSON-LD for anonymous profile visits', async () => {
      const result = await client.loadPage(
        `/user/${TEST_USER_USERNAME}`,
        'seo-user-profile-structured-data',
      )
      const document = parseHtml(result.html, result.response.url)
      const schemas = getJsonLd(document)

      expect(document.title).toContain(TEST_USER_USERNAME)
      expect(getMetaContent(document, 'meta[name="description"]')).toBeTruthy()
      expect(getLinkHref(document, 'link[rel="canonical"]')).toContain('/user/')

      const profileSchema = findSchema<{ mainEntity: Record<string, unknown>; url: string }>(
        schemas,
        'ProfilePage',
      )
      const breadcrumbSchema = findSchema<{ itemListElement: Array<{ name: string }> }>(
        schemas,
        'BreadcrumbList',
      )

      expect(profileSchema).toBeTruthy()
      expect(profileSchema?.mainEntity).toEqual(expect.objectContaining({ '@type': 'Person' }))
      expect(profileSchema?.url).toContain('/user/')
      expect(breadcrumbSchema).toBeTruthy()
      expect(breadcrumbSchema?.itemListElement).toHaveLength(2)
      expect(breadcrumbSchema?.itemListElement[0]).toEqual(
        expect.objectContaining({ name: 'Home' }),
      )
    })

    it('renders visible breadcrumbs and BreadcrumbList JSON-LD on representative pages', async () => {
      await Promise.all(
        [
          '/cards',
          '/reviews',
          '/domains',
          '/sources',
          '/communities',
          '/posts',
          '/topics',
          `/communities/playwright-popular-community`,
        ].map(async path => {
          const result = await client.loadPage(path, `seo-breadcrumbs-${path.replaceAll('/', '-')}`)
          const document = parseHtml(result.html, result.response.url)

          expectBreadcrumbHtml(document)
          expect(findSchema(getJsonLd(document), 'BreadcrumbList')).toBeTruthy()
        }),
      )
    })

    it('user landing pages expose the expected public metadata', async () => {
      const result = await client.loadPage(`/@${TEST_USER_USERNAME}`, 'seo-user-landing-default')
      const document = parseHtml(result.html, result.response.url)

      expect(document.body.textContent).toContain('Test landing page')
      expect(document.body.textContent).toContain('Test profile link')
      expect(document.body.textContent).toContain('Chase Sapphire Referral Picks')
      expect(getLinkHref(document, 'link[rel="canonical"]')).toContain(`/@${TEST_USER_USERNAME}`)
      const ogImage = getMetaContent(document, 'meta[property="og:image"]')
      expect(ogImage).toMatch(/\/og\/[A-Za-z0-9_-]+\?sig=/)

      const slugResult = await client.loadPage(
        `/@${TEST_USER_USERNAME}/bonus`,
        'seo-user-landing-slug',
      )
      expect(parseHtml(slugResult.html, slugResult.response.url).body.textContent).toContain(
        'Bonus page',
      )
    })
  })
})
