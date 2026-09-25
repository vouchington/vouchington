import { beforeEach, describe, expect, it } from 'vitest'

import { removeAdvertisedAgentInterfaceUrls } from '@ts-shared/route-classification'

import { WebIntegrationClient } from '../helpers/client.mts'
import { TEST_USER_USERNAME } from '../helpers/constants.mts'
import { getLinkHref, parseHtml } from '../helpers/html-assertions.mts'

const workerOrigin = process.env.WEB_INTEGRATION_WORKER_ORIGIN
const traceOrigin = process.env.WEB_INTEGRATION_TRACE_ORIGIN
const artifactsDir = process.env.WEB_INTEGRATION_ARTIFACTS_DIR

if (!workerOrigin || !traceOrigin || !artifactsDir) {
  throw new Error('Web integration environment is not configured')
}

let client: WebIntegrationClient

const PRIVATE_DISCOVERY_STRINGS = ['/api/', '/admin/', '/auth/', '/my/', 'apikey=']
const DISCOVERY_LINK_TARGETS = [
  '/llms.txt',
  '/llms-full.txt',
  '/.well-known/api-catalog',
  '/sitemap.xml',
]

describe('website specification verifier', () => {
  beforeEach(() => {
    client = new WebIntegrationClient(workerOrigin, traceOrigin, artifactsDir)
  })

  it('serves machine-readable discovery documents with only allowlisted private resources', async () => {
    const publicResourceCases = [
      ['/llms.txt', 'text/markdown'],
      ['/llms-full.txt', 'text/markdown'],
      ['/.well-known/api-catalog', 'application/linkset+json'],
      ['/.well-known/agent-card.json', 'application/json'],
      ['/.well-known/agent-skills.json', 'application/json'],
      ['/.well-known/security.txt', 'text/plain'],
    ] as const

    const publicResourceResponses = await Promise.all(
      publicResourceCases.map(async ([path, contentType]) => {
        const response = await client.request(path)
        const body = await response.text()
        return { body, contentType, path, response }
      }),
    )

    for (const { body, contentType, response } of publicResourceResponses) {
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain(contentType)
      expect(body).toContain('voucha.ai')
      expect(body).not.toContain('/api/v1/admin/mcp')
      const unadvertised = removeAdvertisedAgentInterfaceUrls(body, 'https://voucha.ai')
      for (const privateString of PRIVATE_DISCOVERY_STRINGS) {
        expect(unadvertised).not.toContain(privateString)
      }
    }

    const trafficAdvice = await client.request('/.well-known/traffic-advice')
    const trafficAdviceBody = await trafficAdvice.text()
    expect(trafficAdvice.status).toBe(200)
    expect(trafficAdvice.headers.get('content-type')).toContain('application/json')
    expect(trafficAdviceBody).toContain('/llms.txt')
    expect(trafficAdviceBody).toContain('/md/posts')
    expect(trafficAdviceBody).toContain('/md/topics')
    expect(trafficAdviceBody).not.toContain('apikey')
  })

  it('keeps robots.txt crawlable for public markdown and discovery resources', async () => {
    const response = await client.request('/robots.txt')
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(body).toContain('Allow: /')
    expect(body).toContain('Sitemap: https://voucha.ai/sitemap.xml')
    expect(body).not.toContain('Disallow: /md/')
    expect(body).not.toContain('Crawl-delay:')
  })

  it('adds discovery Link headers to public pages and omits them from private surfaces', async () => {
    const publicResponse = await client.request('/reviews')
    const publicLink = publicResponse.headers.get('link')

    expect(publicResponse.status).toBe(200)
    expect(publicLink).toContain('<https://voucha.ai/llms.txt>; rel="service-desc"')
    expect(publicLink).toContain('<https://voucha.ai/llms-full.txt>; rel="service-desc"')
    expect(publicLink).toContain('<https://voucha.ai/.well-known/api-catalog>; rel="service-desc"')
    expect(publicLink).toContain('<https://voucha.ai/sitemap.xml>; rel="sitemap"')

    const privateResponse = await client.request('/my/profile', { redirect: 'manual' })
    const privateLink = privateResponse.headers.get('link') ?? ''
    for (const discoveryLinkTarget of DISCOVERY_LINK_TARGETS) {
      expect(privateLink).not.toContain(discoveryLinkTarget)
    }
  })

  it('exposes markdown alternates on indexable detail pages and resolves public aliases', async () => {
    const pages = [[`/user/${TEST_USER_USERNAME}`, `/user/${TEST_USER_USERNAME}.md`]] as const

    const pageResults = await Promise.all(
      pages.map(async ([pagePath, markdownPath]) => {
        const page = await client.loadPage(
          pagePath,
          `website-spec-${pagePath.replaceAll('/', '-')}`,
        )
        const document = parseHtml(page.html, page.response.url)
        const markdownAlternate = getLinkHref(
          document,
          'link[rel="alternate"][type="text/markdown"]',
        )

        const markdown = await client.request(markdownPath)
        const body = await markdown.text()
        return { body, markdown, markdownAlternate, markdownPath, page }
      }),
    )

    for (const { body, markdown, markdownAlternate, markdownPath, page } of pageResults) {
      expect(markdownAlternate).toBeTruthy()
      expect(new URL(markdownAlternate!, page.response.url).pathname).toBe(markdownPath)
      expect(markdown.status).toBe(200)
      expect(markdown.headers.get('content-type')).toContain('text/markdown')
      expect(body).toMatch(/^---/)
    }

    const reviewMarkdown = await client.request('/review/great-travel-card.md')
    const reviewBody = await reviewMarkdown.text()
    expect(reviewMarkdown.status).toBe(200)
    expect(reviewMarkdown.headers.get('content-type')).toContain('text/markdown')
    expect(reviewBody).toMatch(/^---/)

    const topicMarkdown = await client.request('/card/chase-sapphire-preferred.md')
    const topicBody = await topicMarkdown.text()
    expect(topicMarkdown.status).toBe(200)
    expect(topicMarkdown.headers.get('content-type')).toContain('text/markdown')
    expect(topicBody).toMatch(/^---/)
  })

  it('rejects unsafe markdown aliases and never echoes RSS API keys in Link headers', async () => {
    const keyedRss = await client.request('/rewards-program/world-of-hyatt/posts?apikey=fil_secret')
    const keyedRssLink = keyedRss.headers.get('link') ?? ''
    expect(keyedRssLink).not.toContain('apikey=')
    for (const discoveryLinkTarget of DISCOVERY_LINK_TARGETS) {
      expect(keyedRssLink).not.toContain(discoveryLinkTarget)
    }
  })
})
