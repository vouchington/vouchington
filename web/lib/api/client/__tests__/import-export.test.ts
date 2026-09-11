import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportRssFeeds, exportTopics, importRssFeeds, preflightExport } from '../import-export'

describe('import/export client helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('builds a browser-download URL for csv without fetching the response body', () => {
    expect(exportRssFeeds(undefined, 'csv')).toBe('/api/v1/my/export/rss-feeds?format=csv')
  })

  it('builds a topics download URL that preserves the exported file schema', () => {
    expect(exportTopics()).toBe('/api/v1/my/export/topics?download=1')
  })

  it('builds a browser-download URL with feed type and csv format', () => {
    expect(exportRssFeeds('podcast', 'csv')).toBe(
      '/api/v1/my/export/rss-feeds?feed_type=podcast&format=csv',
    )
  })

  it('preflights an export without reading its response body', async () => {
    const cancel = vi.fn<VitestLooseMock>()
    const mockFetch = vi.fn<VitestLooseMock>().mockResolvedValue({
      ok: true,
      status: 204,
      body: { cancel },
    })
    vi.stubGlobal('fetch', mockFetch)

    await preflightExport('/api/v1/my/export/rss-feeds?format=csv')

    expect(mockFetch).toHaveBeenCalledWith('/api/v1/my/export/rss-feeds?format=csv&preflight=1', {
      credentials: 'include',
    })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('preserves bounded error details from a failed export preflight', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<VitestLooseMock>().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: 'Reduce followed items before exporting.',
            code: 'SYNC_EXPORT_TOO_LARGE',
          }),
          { status: 413, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    await expect(preflightExport('/api/v1/my/export/topics?download=1')).rejects.toMatchObject({
      status: 413,
      code: 'SYNC_EXPORT_TOO_LARGE',
      message: 'Reduce followed items before exporting.',
    })
  })

  it('importRssFeeds sends csv field in request body', async () => {
    const mockFetch = vi.fn<VitestLooseMock>().mockResolvedValue(
      new Response(
        JSON.stringify({
          import: {
            id: 'import-1',
            total_rows: 1,
            completed_rows: 0,
            failed_rows: 0,
            pending_rows: 1,
            completed_at: null,
            created_at: '2026-01-01T00:00:00.000Z',
          },
          status_url: '/api/v1/my/import/rss-feeds/import-1',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', mockFetch)

    await importRssFeeds({ csv: 'url,title\nhttps://ex.com,Test', follow: true })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({ csv: 'url,title\nhttps://ex.com,Test', follow: true })
  })

  it('rejects more than 500 URL rows before sending the request', async () => {
    const mockFetch = vi.fn<VitestLooseMock>()
    vi.stubGlobal('fetch', mockFetch)

    await expect(
      importRssFeeds({
        urls: Array.from({ length: 501 }, (_, index) => `https://example.com/${index}.xml`),
        follow: true,
      }),
    ).rejects.toThrow('Maximum 500 URLs per import')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('rejects an encoded OPML JSON body larger than 2 MiB before sending the request', async () => {
    const mockFetch = vi.fn<VitestLooseMock>()
    vi.stubGlobal('fetch', mockFetch)

    await expect(
      importRssFeeds({ opml: '"'.repeat(1024 * 1024 + 1), follow: true }),
    ).rejects.toThrow('2 MiB')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
