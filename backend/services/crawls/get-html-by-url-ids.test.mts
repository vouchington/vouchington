import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { addUrls } from '@services/urls/upsert'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createCrawler } from '@services/crawlers'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { createCrawl } from './create.mts'
import { updateCrawl } from './update.mts'
import { CRAWL_HTML_SNAPSHOT_RETENTION_DAYS } from './constants.mts'

const mockRead = vi.fn<VitestLooseMock>()
const mockDownloadCrawlHtmlToTempFile = vi.fn<VitestLooseMock>()

const captureException = sentryCaptureExceptionMock

import { getLatestHtmlByUrlIds } from './get-html-by-url-ids.mts'

let user: PrivateUser

describe('getLatestHtmlByUrlIds', () => {
  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries only recent eligible 200 crawls and skips individual S3 download failures', async () => {
    const firstHtml = createArtifact('/tmp/first.html', 18)
    const thirdHtml = createArtifact('/tmp/third.html', 18)
    const s3Error = new Error('incorrect header check')

    mockRead.mockResolvedValueOnce({
      rows: [
        { hostname: 'example.com', url_id: 'url-1', html_sha256_hex: 'aaaa' },
        { hostname: 'example.com', url_id: 'url-2', html_sha256_hex: 'bbbb' },
        { hostname: 'example.org', url_id: 'url-3', html_sha256_hex: 'cccc' },
      ],
    })
    mockDownloadCrawlHtmlToTempFile
      .mockResolvedValueOnce(firstHtml)
      .mockRejectedValueOnce(s3Error)
      .mockResolvedValueOnce(thirdHtml)

    const result = await getLatestHtmlByUrlIds(
      ['url-1', 'url-2', 'url-3'],
      {},
      {
        read: mockRead,
        downloadCrawlHtmlToTempFile: mockDownloadCrawlHtmlToTempFile,
      },
    )
    const query = mockRead.mock.calls[0]![0]

    expect(query.text).toContain('c.response_status_code = 200')
    expect(query.text).toContain('c.completed_at >=')
    expect(query.text).toContain('c.html_sha256 IS NOT NULL')
    expect(query.text).toContain('COALESCE(c.html_snapshot_uploaded_at, c.completed_at) >=')
    expect(query.text).toContain('ORDER BY u.id, c.completed_at DESC, c.id DESC')

    expect(result).toEqual([firstHtml, thirdHtml])
    expect(captureException).toHaveBeenCalledWith(s3Error, expect.anything())
  })

  it('uses the content hash S3 key returned by the SQL query', async () => {
    const html = createArtifact('/tmp/current.html', 20)

    mockRead.mockResolvedValueOnce({
      rows: [
        { hostname: 'example.com', url_id: 'url-2', crawl_id: 'crawl-2', html_sha256_hex: 'dddd' },
      ],
    })
    mockDownloadCrawlHtmlToTempFile.mockResolvedValueOnce(html)

    const result = await getLatestHtmlByUrlIds(
      ['url-2'],
      {},
      {
        read: mockRead,
        downloadCrawlHtmlToTempFile: mockDownloadCrawlHtmlToTempFile,
      },
    )

    expect(result).toEqual([html])
    expect(mockDownloadCrawlHtmlToTempFile).toHaveBeenCalledWith('example.com', 'url-2', 'dddd')
  })

  it('reports rows missing the SQL-guaranteed content hash instead of building a null S3 key', async () => {
    mockRead.mockResolvedValueOnce({
      rows: [
        { hostname: 'example.com', url_id: 'url-2', crawl_id: 'crawl-2', html_sha256_hex: null },
      ],
    })

    const result = await getLatestHtmlByUrlIds(
      ['url-2'],
      {},
      {
        read: mockRead,
        downloadCrawlHtmlToTempFile: mockDownloadCrawlHtmlToTempFile,
      },
    )

    expect(result).toEqual([])
    expect(mockDownloadCrawlHtmlToTempFile).not.toHaveBeenCalled()
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Expected latest crawl HTML row to include html_sha256_hex',
      }),
      expect.anything(),
    )
  })

  it.each([
    new Date('2024-01-31T23:59:59.999Z'),
    new Date('2024-02-01T00:00:00.001Z'),
    new Date('2024-02-29T23:59:59.999Z'),
    new Date('2024-03-01T00:00:00.001Z'),
    new Date('2024-12-31T23:59:59.999Z'),
    new Date('2025-01-01T00:00:00.001Z'),
  ])('selects crawl snapshots on the inclusive seven-day cutoff at %s', async now => {
    mockDownloadCrawlHtmlToTempFile.mockReset()
    const cutoff = now.getTime() - CRAWL_HTML_SNAPSHOT_RETENTION_DAYS * 86400000
    const hostname = `snapshot-boundary-${randomUUID()}.example.com`
    const cases = [
      { edge: 'completion', delta: -1 },
      { edge: 'completion', delta: 0 },
      { edge: 'completion', delta: 1 },
      { edge: 'upload', delta: -1 },
      { edge: 'upload', delta: 0 },
      { edge: 'upload', delta: 1 },
      { edge: 'legacy-fallback', delta: -1 },
      { edge: 'legacy-fallback', delta: 0 },
      { edge: 'legacy-fallback', delta: 1 },
    ] as const
    const urls = await addUrls(
      user.id,
      cases.map(({ edge, delta }) => `https://${hostname}/${edge}-${delta}`),
    )
    await updateUrlHostname(urls[0]!.hostname.id, { is_crawlable: true })
    const crawler = await createCrawler(user, {
      hostname_id: urls[0]!.hostname.id,
      crawler_type: 'fetch',
    })
    const hashes = new Map<string, string>()
    const expectedUrlIds: string[] = []

    for (const [index, { edge, delta }] of cases.entries()) {
      const crawl = await createCrawl(urls[index]!.id, crawler.id)
      const hash = Buffer.alloc(32, index + 1)
      hashes.set(urls[index]!.id, hash.toString('hex'))
      const completedAt = edge === 'upload' ? now : new Date(cutoff + delta)
      const uploadedAt =
        edge === 'completion' ? now : edge === 'legacy-fallback' ? null : new Date(cutoff + delta)
      await updateCrawl(crawl.id, urls[index]!.id, {
        completed_at: completedAt,
        html_sha256: hash,
        html_snapshot_uploaded_at: uploadedAt,
        response_status_code: 200,
      })
      if (delta >= 0) expectedUrlIds.push(urls[index]!.id)
    }
    mockDownloadCrawlHtmlToTempFile.mockResolvedValue(createArtifact('/tmp/boundary.html', 10))

    await getLatestHtmlByUrlIds(
      urls.map(url => url.id),
      {},
      {
        downloadCrawlHtmlToTempFile: mockDownloadCrawlHtmlToTempFile,
        now: () => now,
      },
    )

    const actual = mockDownloadCrawlHtmlToTempFile.mock.calls.map(([, urlId, hash]) => [
      urlId,
      hash,
    ])
    const expected = expectedUrlIds.map(urlId => [urlId, hashes.get(urlId)])
    const byUrlId = ([leftUrl]: (string | undefined)[], [rightUrl]: (string | undefined)[]) =>
      (leftUrl ?? '').localeCompare(rightUrl ?? '')
    expect(actual.toSorted(byUrlId)).toEqual(expected.toSorted(byUrlId))
  })

  it('rejects an invalid snapshot decision time before reading', async () => {
    await expect(
      getLatestHtmlByUrlIds(
        ['unused'],
        {},
        {
          read: mockRead,
          downloadCrawlHtmlToTempFile: mockDownloadCrawlHtmlToTempFile,
          now: () => new Date(Number.NaN),
        },
      ),
    ).rejects.toThrow('Invalid HTML snapshot decision time')
    expect(mockRead).not.toHaveBeenCalled()
  })
})

function createArtifact(filePath: string, byteLength: number) {
  return {
    filePath,
    byteLength,
    cleanup: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }
}
