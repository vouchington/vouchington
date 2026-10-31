import { it, expect, describe } from 'vitest'
import { getSourceCacheHeaders } from '@services/urls-domains-blacklist/sources'
import { syncBlacklistSourceById } from '../sync.mts'

import { createTestBlacklistSource, listBlacklistDomainsBySource } from '@voucha/test-helpers'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { createFetchSafeTestServer } from '@voucha/test-helpers/fetch-safe-test-server'

describe('index.generated', () => {
  const suffix = Array.from({ length: 8 }, () =>
    String.fromCodePoint(97 + Math.floor(Math.random() * 26)),
  ).join('')

  it('syncBlacklistSourceById records a non-200 response without storing domains', async () => {
    const errorServer = await createFetchSafeTestServer((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Internal Server Error')
    })
    const url = errorServer.url('/list.txt')

    try {
      const sourceId = await createTestBlacklistSource({
        type: 'url',
        name: `test-sync-error-${suffix}`,
        url,
      })

      const reportedAt = sentryCaptureExceptionMock.mock.calls.length
      await expect(syncBlacklistSourceById(sourceId)).resolves.toBeUndefined()
      expect(await listBlacklistDomainsBySource(sourceId)).toEqual([])
      expect(
        sentryCaptureExceptionMock.mock.calls
          .slice(reportedAt)
          .filter(
            ([error]) =>
              error instanceof Error &&
              error.message.includes('Failed to fetch domain blacklist: 500'),
          ),
      ).toHaveLength(1)
    } finally {
      await errorServer.close()
    }
  })

  it('syncBlacklistSource stores cache headers after sync', async () => {
    const etag = '"test-etag-value"'
    const lastModified = 'Wed, 15 Jan 2025 10:00:00 GMT'

    const cacheServer = await createFetchSafeTestServer((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        ETag: etag,
        'Last-Modified': lastModified,
      })
      res.end('cached.com\n')
    })
    const url = cacheServer.url('/list.txt')

    try {
      const sourceId = await createTestBlacklistSource({
        type: 'url',
        name: `test-sync-cache-${suffix}`,
        url,
      })

      await syncBlacklistSourceById(sourceId)

      const cache = await getSourceCacheHeaders(sourceId)
      expect(cache!.etag).toBe(etag)
      expect(cache!.last_modified_at).not.toBeNull()
    } finally {
      await cacheServer.close()
    }
  })

  it('syncBlacklistSource stores null for invalid Last-Modified header', async () => {
    const etag = '"invalid-date-etag"'

    const cacheServer = await createFetchSafeTestServer((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        ETag: etag,
        'Last-Modified': 'not-a-valid-date',
      })
      res.end('cached-invalid-date.com\n')
    })
    const url = cacheServer.url('/list.txt')

    try {
      const sourceId = await createTestBlacklistSource({
        type: 'url',
        name: `test-sync-cache-invalid-date-${suffix}`,
        url,
      })

      await syncBlacklistSourceById(sourceId)

      const cache = await getSourceCacheHeaders(sourceId)
      expect(cache!.etag).toBe(etag)
      expect(cache!.last_modified_at).toBeNull()
    } finally {
      await cacheServer.close()
    }
  })
})
