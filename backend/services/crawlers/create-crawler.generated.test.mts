import { createHash } from 'node:crypto'
import { it, expect, beforeAll, describe } from 'vitest'
import {
  createCrawler,
  updateCrawler,
  getOrCreateCrawlerForHostname,
  updateCrawlerCssSelectorsByHostname,
} from './index.mts'
import { searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId } from './boilerplate-removal.mts'
import { getCrawlerById, getCrawlerForHostnameId } from './get.mts'
import {
  createTestUser,
  insertTestUrlHostname,
  insertTestUrl,
  insertTestCrawl,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

// Uses insertTestUrlHostname/insertTestUrl/insertTestCrawl (not addUrl/createCrawl/updateCrawl
// from @services/urls and @services/crawls) because services/crawlers must not depend back on
// those packages for tests: @services/urls already depends on @services/crawlers for real
// (getOrCreateCrawlerForHostname), and @services/crawls already depends on @services/crawlers
// for real (crawler-selection in retry-candidates.mts/preflight.mts).
async function createTestUrlWithNewHostname(
  url: string,
): Promise<{ id: string; hostname: { id: string } }> {
  const hostname = new URL(url).hostname
  const hostnameId = await insertTestUrlHostname({ hostname })
  const id = await insertTestUrl({ url, hostnameId })
  return { id, hostname: { id: hostnameId } }
}

describe('create-crawler.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('createCrawler creates a new crawler', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await createTestUrlWithNewHostname(
      `https://crawler-create-${random}.example.com/test`,
    )
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
      description: 'Test description',
      priority: 5,
      css_selectors_to_remove: ['.ad', '.sidebar'],
    })
    expect(crawler).toBeDefined()
    expect(crawler.hostname_id).toBe(url!.hostname.id)
    expect(crawler.priority).toBe(5)
  })

  it('updateCrawler updates crawler fields', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await createTestUrlWithNewHostname(
      `https://crawler-update-${random}.example.com/test`,
    )
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
      description: 'Original',
    })
    const updated = await updateCrawler(user, crawler.id, {
      description: 'Updated',
      priority: 10,
      css_selectors_to_remove: ['.updated'],
    })

    expect(updated.description).toBe('Updated')
    expect(updated.priority).toBe(10)
    expect(updated.css_selectors_to_remove).toEqual(['.updated'])
  })

  it('getOrCreateCrawlerForHostname creates once and reuses', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await createTestUrlWithNewHostname(
      `https://crawler-get-or-create-${random}.example.com/test`,
    )
    const first = await getOrCreateCrawlerForHostname(null, url!.hostname.id)
    const second = await getOrCreateCrawlerForHostname(null, url!.hostname.id)

    expect(second.id).toBe(first.id)

    const byHostname = await getCrawlerForHostnameId(url!.hostname.id)
    expect(byHostname).toBeDefined()
    expect(byHostname!.id).toBe(first.id)
  })

  it('createCrawler allows multiple active crawlers per hostname', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await createTestUrlWithNewHostname(
      `https://crawler-conflict-${random}.example.com/test`,
    )
    const first = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const second = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })

    expect(second.id).not.toBe(first.id)
    expect(second.hostname_id).toBe(first.hostname_id)
  })

  it('updateCrawlerCssSelectorsByHostname is append-only and deduplicates', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await createTestUrlWithNewHostname(
      `https://crawler-selectors-${random}.example.com/test`,
    )
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
      css_selectors_to_remove: ['.existing', '.shared'],
    })
    const changed = await updateCrawlerCssSelectorsByHostname(url!.hostname.id, [
      '.shared',
      '.new',
      '.new',
    ])
    expect(changed).toBe(true)

    const updated = await getCrawlerById(crawler.id)
    expect(updated).toBeDefined()
    expect(updated!.css_selectors_to_remove).toEqual(['.existing', '.shared', '.new'])
  })

  it('searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId returns only recent body-backed crawls', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `crawler-boilerplate-${random}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const base = `https://${hostname}`
    const recentUrlId = await insertTestUrl({ url: `${base}/blog/recent`, hostnameId })
    const newer304UrlId = await insertTestUrl({ url: `${base}/blog/newer-304`, hostnameId })
    const staleUrlId = await insertTestUrl({ url: `${base}/blog/stale`, hostnameId })
    const noHashUrlId = await insertTestUrl({ url: `${base}/blog/no-hash`, hostnameId })
    await insertTestUrl({ url: `${base}/blog/deeper/path`, hostnameId })

    await createCrawler(user, {
      hostname_id: hostnameId,
      crawler_type: 'fetch',
    })
    await createCrawlerTestCrawl(recentUrlId, {
      completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      htmlSha256Seed: 'recent',
      statusCode: 200,
    })
    await createCrawlerTestCrawl(newer304UrlId, {
      completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      htmlSha256Seed: 'older-200',
      statusCode: 200,
    })
    await createCrawlerTestCrawl(newer304UrlId, {
      completedAt: new Date(),
      htmlSha256Seed: 'newer-304',
      statusCode: 304,
    })
    await createCrawlerTestCrawl(staleUrlId, {
      completedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      htmlSha256Seed: 'stale',
      statusCode: 200,
    })
    await createCrawlerTestCrawl(noHashUrlId, {
      completedAt: new Date(),
      htmlSha256Seed: null,
      statusCode: 200,
    })

    const candidates = await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
      hostnameId,
      '/blog',
      10,
    )

    expect(candidates.map(candidate => candidate.id).sort()).toEqual(
      [newer304UrlId, recentUrlId].sort(),
    )

    const mostRecentCandidate = await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
      hostnameId,
      '/blog',
      1,
    )
    expect(mostRecentCandidate.map(candidate => candidate.id)).toEqual([newer304UrlId])
  })

  it('createCrawler throws when hostname reference is missing', async () => {
    await expect(
      createCrawler(user, {
        crawler_type: 'fetch',
      } as any),
    ).rejects.toThrow('hostname_id is required')
  })

  it('createCrawler throws for invalid hostname ID', async () => {
    await expect(
      createCrawler(user, {
        crawler_type: 'fetch',
        hostname_id: 'not-a-uuid',
      }),
    ).rejects.toThrow('Invalid hostname ID')
  })

  it('updateCrawler throws for invalid hostname ID', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await createTestUrlWithNewHostname(
      `https://crawler-update-wildcard-${random}.example.com/test`,
    )
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    await expect(
      updateCrawler(user, crawler.id, {
        hostname_id: 'not-a-uuid',
      }),
    ).rejects.toThrow('Invalid hostname ID')
  })
})

async function createCrawlerTestCrawl(
  urlId: string,
  options: {
    completedAt: Date
    htmlSha256Seed: string | null
    statusCode: number
  },
) {
  return insertTestCrawl({
    urlId,
    statusCode: options.statusCode,
    markdown: '',
    completedAt: options.completedAt,
    htmlSnapshotUploadedAt: options.htmlSha256Seed === null ? undefined : options.completedAt,
    htmlSha256:
      options.htmlSha256Seed === null
        ? undefined
        : createHash('sha256').update(options.htmlSha256Seed).digest(),
  })
}
