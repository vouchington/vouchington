import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'

const mockRead = vi.fn<VitestLooseMock>()
const mockDownloadCrawlHtmlToTempFile = vi.fn<VitestLooseMock>()

const captureException = sentryCaptureExceptionMock

import { getLatestHtmlByUrlIds } from './get-html-by-url-ids.mts'

describe('getLatestHtmlByUrlIds', () => {
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
})

function createArtifact(filePath: string, byteLength: number) {
  return {
    filePath,
    byteLength,
    cleanup: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }
}
