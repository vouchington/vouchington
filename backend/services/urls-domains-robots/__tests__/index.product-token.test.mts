import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CRAWLER_USER_AGENT } from '../../../config/crawler.mts'
import { computeHostnameRateLimitMs, isUrlCrawlable } from '../index.mts'

const mockFetchWithTimeoutSimple = vi.fn<VitestLooseMock>()
const mockReadResponseBody = vi.fn<VitestLooseMock>()
const dependencies = {
  fetchWithTimeoutSimple: mockFetchWithTimeoutSimple,
  isNetworkError: vi.fn<VitestLooseMock>(),
  isRetryableError: vi.fn<VitestLooseMock>(),
  readResponseBody: mockReadResponseBody,
}

function randomDomain() {
  return `test-robots-token-${Math.random().toString(36).slice(2)}.com`
}

function robotsResponse() {
  return { status: 200, statusText: 'OK', body: {} }
}

describe('robots product token', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['Disallow', 'Disallow: /', 'Allow: /', false],
    ['Allow', 'Allow: /', 'Disallow: /', true],
  ])(
    'matches a voucha-bot %s group for the full crawler User-Agent',
    async (_rule, specificRule, wildcardRule, expected) => {
      const domain = randomDomain()
      mockFetchWithTimeoutSimple.mockResolvedValue(robotsResponse())
      mockReadResponseBody.mockResolvedValue(
        `User-agent: voucha-bot\n${specificRule}\n\nUser-agent: *\n${wildcardRule}\n`,
      )

      const result = await isUrlCrawlable(`https://${domain}/page`, CRAWLER_USER_AGENT, {
        dependencies,
      })

      expect(result).toBe(expected)
    },
  )

  it('uses the voucha-bot Crawl-delay for the full crawler User-Agent', async () => {
    const domain = randomDomain()
    mockFetchWithTimeoutSimple.mockResolvedValue(robotsResponse())
    mockReadResponseBody.mockResolvedValue(
      'User-agent: voucha-bot\nCrawl-delay: 8\n\nUser-agent: *\nCrawl-delay: 1\n',
    )

    const result = await computeHostnameRateLimitMs(domain, 1, CRAWLER_USER_AGENT, dependencies)

    expect(result).toBe(8_000)
  })
})
