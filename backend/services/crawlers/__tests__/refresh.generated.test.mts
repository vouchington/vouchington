import { beforeAll, expect, it, describe } from 'vitest'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { upsertUrlHostnames } from '@services/urls-hostnames'
import {
  createTestUser,
  insertStaleFetchCrawlerForHostname,
  insertTestUrlHostname,
  insertTestUrl,
} from '@voucha/test-helpers'
import {
  searchCrawlerRefreshUrlCandidatesByHostnameId,
  searchHostnameIdsNeedingCrawlerRefresh,
} from '../refresh.mts'
import type { PrivateUser } from '@services/users/types'

// Uses insertTestUrlHostname/insertTestUrl (not addUrl from @services/urls) because
// @services/urls already depends on @services/crawlers for real (getOrCreateCrawlerForHostname),
// so services/crawlers must not depend back on @services/urls for tests.
async function createTestUrlWithNewHostname(
  url: string,
): Promise<{ id: string; hostname: { id: string } }> {
  const hostname = new URL(url).hostname
  const hostnameId = await insertTestUrlHostname({ hostname })
  const id = await insertTestUrl({ url, hostnameId })
  return { id, hostname: { id: hostnameId } }
}

describe('refresh.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('searchHostnameIdsNeedingCrawlerRefresh excludes non-crawlable hostnames', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const crawlableUrl = await createTestUrlWithNewHostname(
      `https://refresh-crawlable-${random}.example.com/a`,
    )
    const nonCrawlableUrl = await createTestUrlWithNewHostname(
      `https://refresh-noncrawlable-${random}.example.com/a`,
    )

    await updateUrlHostname(crawlableUrl!.hostname.id, { crawlable: true })
    await updateUrlHostname(nonCrawlableUrl!.hostname.id, { crawlable: false })

    const ids = await searchHostnameIdsNeedingCrawlerRefresh(100)

    expect(ids).not.toContain(nonCrawlableUrl!.hostname.id)
  })

  it('searchCrawlerRefreshUrlCandidatesByHostnameId returns at most the requested limit', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `refresh-limit-${random}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const base = `https://${hostname}`
    const urls = await Promise.all([
      insertTestUrl({ url: `${base}/1`, hostnameId }),
      insertTestUrl({ url: `${base}/2`, hostnameId }),
      insertTestUrl({ url: `${base}/3`, hostnameId }),
      insertTestUrl({ url: `${base}/4`, hostnameId }),
    ])

    await updateUrlHostname(hostnameId, { crawlable: true })

    const candidates = await searchCrawlerRefreshUrlCandidatesByHostnameId(hostnameId, 3)

    expect(candidates.length).toBe(3)
    expect(
      candidates.every(candidate => candidate.url.includes(`refresh-limit-${random}.example.com`)),
    ).toBe(true)
    expect(urls).toHaveLength(4)
  })

  it('searchHostnameIdsNeedingCrawlerRefresh returns unique hostname IDs', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `refresh-unique-${random}.example.com`
    const upserted = await upsertUrlHostnames(user.id, [hostname])
    const hostnameId = upserted.get(hostname)
    expect(hostnameId).toBeDefined()

    await updateUrlHostname(hostnameId!, { crawlable: true })

    await insertStaleFetchCrawlerForHostname(hostnameId!)
    const ids = await searchHostnameIdsNeedingCrawlerRefresh(10_000)
    expect(ids.filter(id => id === hostnameId)).toHaveLength(1)
  })

  it('searchCrawlerRefreshUrlCandidatesByHostnameId excludes IDs and returns unique candidates', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `refresh-exclude-${random}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const base = `https://${hostname}`
    const urls = await Promise.all([
      insertTestUrl({ url: `${base}/1`, hostnameId }),
      insertTestUrl({ url: `${base}/2`, hostnameId }),
      insertTestUrl({ url: `${base}/3`, hostnameId }),
      insertTestUrl({ url: `${base}/4`, hostnameId }),
      insertTestUrl({ url: `${base}/5`, hostnameId }),
    ])

    await updateUrlHostname(hostnameId, { crawlable: true })

    const excludedIds = [urls[0], urls[1]]
    const candidates = await searchCrawlerRefreshUrlCandidatesByHostnameId(
      hostnameId,
      3,
      {},
      excludedIds,
    )

    const candidateIds = candidates.map(candidate => candidate.id)

    expect(candidates).toHaveLength(3)
    expect(new Set(candidateIds).size).toBe(candidateIds.length)
    expect(candidateIds.some(id => excludedIds.includes(id))).toBe(false)
  })

  it('searchCrawlerRefreshUrlCandidatesByHostnameId returns random candidates from the hostname', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `refresh-random-${random}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const base = `https://${hostname}`
    const urls = await Promise.all([
      insertTestUrl({ url: `${base}/1`, hostnameId }),
      insertTestUrl({ url: `${base}/2`, hostnameId }),
      insertTestUrl({ url: `${base}/3`, hostnameId }),
    ])

    await updateUrlHostname(hostnameId, { crawlable: true })

    const candidates = await searchCrawlerRefreshUrlCandidatesByHostnameId(hostnameId)

    expect(candidates).toHaveLength(3)
    const candidateIds = new Set(candidates.map(c => c.id))
    for (const urlId of urls) {
      expect(candidateIds.has(urlId)).toBe(true)
    }
  })
})
