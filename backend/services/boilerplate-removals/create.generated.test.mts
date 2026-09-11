import { createHash } from 'node:crypto'
import { beforeAll, expect, it, describe } from 'vitest'
import { addUrl } from '@services/urls'
import { createCrawler } from '@services/crawlers'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { createTestUser, insertUrlHostname } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createCrawl } from '@services/crawls/create'
import { updateCrawl } from '@services/crawls/update'
import { createBoilerplateRemoval } from './create.mts'
import { deleteBoilerplateRemovalsByHostnameId } from './delete.mts'
import { getLatestBoilerplateRemovalByHostnameAndPath } from './get.mts'
import { searchParentPathsNeedingBoilerplateRemoval } from './search.mts'

describe('create.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('createBoilerplateRemoval creates a record with empty results', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(null, `https://bp-create-${random}.example.com/blog/post1`)
    await updateUrlHostname(url!.hostname.id, { crawlable: true })
    await deleteBoilerplateRemovalsByHostnameId(url!.hostname.id)

    const result = await createBoilerplateRemoval(
      url!.hostname.id,
      '/blog',
      { cssSelectorsToRemove: [], htmlToRemove: [] },
      [url!.id],
    )
    expect(result).toBeDefined()
    expect(result.hostname_id).toBe(url!.hostname.id)
    expect(result.parent_path).toBe('/blog')
  })

  it('createBoilerplateRemoval updates existing row on re-run for same hostname and path', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(null, `https://bp-history-${random}.example.com/docs/page1`)
    await updateUrlHostname(url!.hostname.id, { crawlable: true })
    await deleteBoilerplateRemovalsByHostnameId(url!.hostname.id)

    const first = await createBoilerplateRemoval(
      url!.hostname.id,
      '/docs',
      { cssSelectorsToRemove: ['.nav'], htmlToRemove: [] },
      [url!.id],
    )

    const second = await createBoilerplateRemoval(
      url!.hostname.id,
      '/docs',
      { cssSelectorsToRemove: ['.footer'], htmlToRemove: [] },
      [url!.id],
    )
    expect(second.id).toBe(first.id)

    // The latest should be returned by getLatestBoilerplateRemovalByHostnameAndPath
    const latest = await getLatestBoilerplateRemovalByHostnameAndPath(url!.hostname.id, '/docs')
    expect(latest).not.toBeNull()
    expect(latest!.id).toBe(second.id)
    expect(latest!.results.cssSelectorsToRemove).toEqual(['.footer'])
  })

  it('getLatestBoilerplateRemovalByHostnameAndPath returns recent record', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(null, `https://bp-get-${random}.example.com/articles/a1`)
    await updateUrlHostname(url!.hostname.id, { crawlable: true })
    await deleteBoilerplateRemovalsByHostnameId(url!.hostname.id)

    const created = await createBoilerplateRemoval(
      url!.hostname.id,
      '/articles',
      { cssSelectorsToRemove: [], htmlToRemove: [] },
      [],
    )
    const found = await getLatestBoilerplateRemovalByHostnameAndPath(url!.hostname.id, '/articles')

    expect(found).not.toBeNull()
    expect(found!.id).toBe(created.id)
  })

  it('getLatestBoilerplateRemovalByHostnameAndPath returns null when no record exists for path', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(null, `https://bp-none-${random}.example.com/foo/bar`)
    // Query for a parent path that was never inserted
    const found = await getLatestBoilerplateRemovalByHostnameAndPath(
      url!.hostname.id,
      '/nonexistent',
    )

    expect(found).toBeNull()
  })

  it('searchParentPathsNeedingBoilerplateRemoval finds paths with >= 2 URLs and no recent removal', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const base = `https://bp-search-${random}.example.com`
    const hostname = `bp-search-${random}.example.com`

    await insertUrlHostname(hostname, { crawlable: false, blocked: false })

    const url1 = await addUrl(null, `${base}/blog/post1`)
    const url2 = await addUrl(null, `${base}/blog/post2`)
    // Clear any removals created by URL listeners before checking candidates.
    await deleteBoilerplateRemovalsByHostnameId(url1!.hostname.id)
    await updateUrlHostname(url1!.hostname.id, { crawlable: true })
    const crawler = await createCrawler(user!, {
      hostname_id: url1!.hostname.id,
      crawler_type: 'fetch',
    })
    await createEligibleCrawl(url1!.id, crawler.id, new Date(Date.now() - 2 * 24 * 60 * 60 * 1000))
    await createEligibleCrawl(url2!.id, crawler.id, new Date(Date.now() - 1 * 24 * 60 * 60 * 1000))

    const results = await searchParentPathsNeedingBoilerplateRemoval(1000, {
      hostnameId: url1!.hostname.id,
    })

    const match = results.find(
      r => r.hostname_id === url1!.hostname.id && r.parent_path === '/blog',
    )
    expect(match).toBeDefined()
  })

  it('searchParentPathsNeedingBoilerplateRemoval excludes paths with recent removal', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const base = `https://bp-excluded-${random}.example.com`

    const url1 = await addUrl(null, `${base}/news/story1`)
    const url2 = await addUrl(null, `${base}/news/story2`)
    await updateUrlHostname(url1!.hostname.id, { crawlable: true })
    const crawler = await createCrawler(user!, {
      hostname_id: url1!.hostname.id,
      crawler_type: 'fetch',
    })
    await createEligibleCrawl(url1!.id, crawler.id, new Date(Date.now() - 2 * 24 * 60 * 60 * 1000))
    await createEligibleCrawl(url2!.id, crawler.id, new Date(Date.now() - 1 * 24 * 60 * 60 * 1000))

    // Create a recent boilerplate removal - should exclude this path
    await createBoilerplateRemoval(
      url1!.hostname.id,
      '/news',
      { cssSelectorsToRemove: [], htmlToRemove: [] },
      [],
    )
    const results = await searchParentPathsNeedingBoilerplateRemoval(1000)

    const match = results.find(
      r => r.hostname_id === url1!.hostname.id && r.parent_path === '/news',
    )
    expect(match).toBeUndefined()
  })

  it('searchParentPathsNeedingBoilerplateRemoval ignores paths with only 1 URL', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const base = `https://bp-single-${random}.example.com`

    // Only one URL has recent eligible crawl HTML - should not appear.
    const url1 = await addUrl(null, `${base}/solo/only`)
    const url2 = await addUrl(null, `${base}/solo/another`)
    await updateUrlHostname(url1!.hostname.id, { crawlable: true })
    const crawler = await createCrawler(user!, {
      hostname_id: url1!.hostname.id,
      crawler_type: 'fetch',
    })
    await createEligibleCrawl(url1!.id, crawler.id, new Date())
    await createNonEligible304Crawl(url2!.id, crawler.id, new Date())

    const results = await searchParentPathsNeedingBoilerplateRemoval(1000)

    const match = results.find(
      r => r.hostname_id === url1!.hostname.id && r.parent_path === '/solo',
    )
    expect(match).toBeUndefined()
  })
})

async function createEligibleCrawl(urlId: string, crawlerId: string, completedAt: Date) {
  const crawl = await createCrawl(urlId, crawlerId)
  return updateCrawl(crawl.id, urlId, {
    response_status_code: 200,
    completed_at: completedAt,
    html_sha256: createHash('sha256').update(`${urlId}:${completedAt.toISOString()}`).digest(),
    html_snapshot_uploaded_at: completedAt,
  })
}

async function createNonEligible304Crawl(urlId: string, crawlerId: string, completedAt: Date) {
  const crawl = await createCrawl(urlId, crawlerId)
  return updateCrawl(crawl.id, urlId, {
    response_status_code: 304,
    completed_at: completedAt,
    html_sha256: createHash('sha256').update(`${urlId}:${completedAt.toISOString()}`).digest(),
  })
}
