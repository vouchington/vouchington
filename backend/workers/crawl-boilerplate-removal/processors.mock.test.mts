import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { gzipBytes } from '@modules/utils/compression'
import { createTestUser } from '@voucha/test-helpers'
import { addUrls } from '@services/urls/upsert'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { createCrawler } from '@services/crawlers'
import { createCrawl } from '@services/crawls/create'
import { updateCrawl } from '@services/crawls/update'
import { getLatestBoilerplateRemovalByHostnameAndPath } from '@services/boilerplate-removals'
import { processBoilerplateRemoval } from './processors.mts'

vi.mock<typeof import('@modules/aws')>(import('@modules/aws'), async importOriginal => {
  const mockSend = vi.fn<VitestLooseMock>()
  return {
    ...(await importOriginal<typeof import('@modules/aws')>()),
    S3ImagesClient: {
      send: mockSend,
    } as unknown as typeof import('@modules/aws').S3ImagesClient,
  }
})

import { S3ImagesClient } from '@modules/aws'

describe('processBoilerplateRemoval', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts DOM removals from the latest HTML snapshots and persists the result', async () => {
    const mockSend = vi.mocked(S3ImagesClient.send)
    const html = '<html><body><header>Nav</header><p>Unique content</p></body></html>'
    const gzipped = await gzipBytes(Buffer.from(html))
    mockSend.mockImplementation(
      async () =>
        ({
          Body: Readable.from([gzipped]),
        }) as never,
    )

    const user = await createTestUser()
    const hostname = `bp-processor-${Date.now()}.example.com`
    const urls = await addUrls(user.id, [
      `https://${hostname}/blog/post-1`,
      `https://${hostname}/blog/post-2`,
    ])
    await updateUrlHostname(urls[0]!.hostname.id, { crawlable: true })
    const crawler = await createCrawler(user, {
      hostname_id: urls[0]!.hostname.id,
      crawler_type: 'fetch',
    })
    await Promise.all(
      urls.map(async url => {
        const crawl = await createCrawl(url.id, crawler.id)
        return updateCrawl(crawl.id, url.id, {
          response_status_code: 200,
          completed_at: new Date(),
          html_sha256: createHash('sha256').update(url.id).digest(),
          html_snapshot_uploaded_at: new Date(),
        })
      }),
    )

    const result = await processBoilerplateRemoval(urls[0]!.hostname.id, '/blog')

    expect(result).toEqual({
      hostname_id: urls[0]!.hostname.id,
      parent_path: '/blog',
      skipped: false,
    })
    expect(mockSend).toHaveBeenCalledTimes(2)

    const removal = await getLatestBoilerplateRemovalByHostnameAndPath(
      urls[0]!.hostname.id,
      '/blog',
    )
    expect(removal?.results).toEqual(
      expect.objectContaining({
        cssSelectorsToRemove: expect.any(Array),
        htmlToRemove: expect.any(Array),
      }),
    )
  })
})
