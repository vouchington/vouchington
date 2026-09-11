import { beforeEach, describe, expect, it, vi } from 'vitest'
import undici from 'undici'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'
import { BLACKLISTS } from '@services/urls-domains-blacklist/sources-constants'
import { createBlacklistFetchHeaders, syncBlacklistSource } from './sync.mts'

type UndiciResponse = Awaited<ReturnType<typeof undici.fetch>>

const fetchSpy = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock<typeof import('undici')>(import('undici'), async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, default: { ...actual.default, fetch: fetchSpy } }
})

const syncResult = {
  skipped: false,
  domainsAdded: 2,
  domainsRemoved: 1,
}
const syncDomainsWithDatabase = vi.fn<VitestLooseMock>().mockResolvedValue(syncResult)
const getSourceCacheHeaders = vi.fn<VitestLooseMock>()
const updateSourceCacheHeaders = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
const dependencies = {
  getSourceCacheHeaders,
  updateSourceCacheHeaders,
  syncDomainsWithDatabase,
}

describe('syncBlacklistSource', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    fetchSpy.mockReset()
    syncDomainsWithDatabase.mockClear()
    getSourceCacheHeaders.mockReset()
    updateSourceCacheHeaders.mockClear()
  })

  it('fetches every configured source with production request options', async () => {
    const cache = {
      etag: '"old-etag"',
      last_modified_at: new Date('2025-02-03T10:00:00.000Z'),
    }
    getSourceCacheHeaders.mockResolvedValue(cache)
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')

    for (const [index, source] of BLACKLISTS.entries()) {
      const response = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          etag: `"new-etag-${index}"`,
          'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT',
        }),
      } as unknown as UndiciResponse
      fetchSpy.mockResolvedValueOnce(response)
      const sourceId = index + 1

      await expect(
        syncBlacklistSource(sourceId, source.url, source.type, dependencies),
      ).resolves.toEqual(syncResult)

      const expectedCallNumber = index + 1
      expect(timeoutSpy).toHaveBeenNthCalledWith(expectedCallNumber, 30_000)
      expect(fetchSpy).toHaveBeenNthCalledWith(expectedCallNumber, source.url, {
        dispatcher: getExternalRequestDispatcher(),
        headers: {
          'Accept-Encoding': 'gzip, deflate, br',
          'If-Modified-Since': 'Mon, 03 Feb 2025 10:00:00 GMT',
          'If-None-Match': '"old-etag"',
        },
        redirect: 'follow',
        signal: timeoutSpy.mock.results[index]!.value,
      })
      expect(fetchSpy.mock.calls[index]![1]).not.toHaveProperty('method')
      expect(syncDomainsWithDatabase).toHaveBeenNthCalledWith(
        expectedCallNumber,
        String(sourceId),
        response,
        source.type,
      )
    }

    expect(fetchSpy).toHaveBeenCalledTimes(BLACKLISTS.length)
    expect(syncDomainsWithDatabase).toHaveBeenCalledTimes(BLACKLISTS.length)
  })

  it('builds conditional request headers from cached metadata', () => {
    expect(
      createBlacklistFetchHeaders({
        etag: '"old-etag"',
        last_modified_at: new Date('2025-02-03T10:00:00.000Z'),
      }),
    ).toEqual({
      'Accept-Encoding': 'gzip, deflate, br',
      'If-Modified-Since': 'Mon, 03 Feb 2025 10:00:00 GMT',
      'If-None-Match': '"old-etag"',
    })
  })

  it('updates cached headers and skips syncing on 304', async () => {
    const cache = {
      etag: '"old-etag"',
      last_modified_at: new Date('2025-02-03T10:00:00.000Z'),
    }
    getSourceCacheHeaders.mockResolvedValue(cache)
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 304,
      statusText: 'Not Modified',
    } as unknown as UndiciResponse)

    const result = await syncBlacklistSource(
      123,
      'https://example.com/list.txt',
      'url',
      dependencies,
    )

    expect(result).toEqual({ skipped: true, domainsAdded: 0, domainsRemoved: 0 })
    expect(updateSourceCacheHeaders).toHaveBeenCalledWith(123, {
      etag: '"old-etag"',
      lastModifiedAt: new Date('2025-02-03T10:00:00.000Z'),
    })
    expect(syncDomainsWithDatabase).not.toHaveBeenCalled()
  })
})
