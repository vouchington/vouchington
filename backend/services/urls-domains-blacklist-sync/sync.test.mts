import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import undici from 'undici'
import { getExternalRequestDispatcher } from '@modules/utils/http'
import * as bloomEnqueues from '@queues/bloom-filters/enqueues'
import {
  getSourceCacheHeaders,
  updateSourceCacheHeaders,
} from '@services/urls-domains-blacklist/sources'
import {
  createTestBlacklistSource,
  deleteTestBlacklistSource,
  getTestBlacklistSourceLastFetchedAt,
  insertTestDomainBlacklist,
  listBlacklistDomainsBySource,
} from '@voucha/test-helpers'
import { createFetchSafeTestServer } from '@voucha/test-helpers/fetch-safe-test-server'
import { ReplicaBehindError } from './replica-freshness.mts'
import * as replicaSourceVersion from './replica-source-version.mts'
import { syncBlacklistSourceById } from './sync.mts'

type SeenRequest = {
  method: string | undefined
  url: string | undefined
  headers: IncomingHttpHeaders
}

const ETAG = '"new-etag"'
const LAST_MODIFIED = 'Wed, 01 Jan 2025 00:00:00 GMT'

function sourceNameSuffix(): string {
  return Array.from(crypto.randomUUID().replaceAll('-', ''), digit =>
    String.fromCodePoint(97 + Number.parseInt(digit, 16)),
  ).join('')
}

async function serveSource(
  respond: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ url: (path: string) => string; seen: SeenRequest[] }> {
  const seen: SeenRequest[] = []
  const server = await createFetchSafeTestServer((request, response) => {
    seen.push({ method: request.method, url: request.url, headers: request.headers })
    respond(request, response)
  })
  onTestFinished(() => server.close())
  return { url: path => server.url(path), seen }
}

async function createSource(
  type: 'url' | 'email',
  url: string,
  name = `sync-${type}-${sourceNameSuffix()}`,
): Promise<string> {
  const sourceId = await createTestBlacklistSource({ type, name, url })
  onTestFinished(() => deleteTestBlacklistSource(sourceId))
  return String(sourceId)
}

function respondValidated(domain: string) {
  return (request: IncomingMessage, response: ServerResponse) => {
    if (request.headers['if-none-match'] === ETAG) {
      response.writeHead(304)
      response.end()
      return
    }
    response.writeHead(200, {
      'Content-Type': 'text/plain',
      ETag: ETAG,
      'Last-Modified': LAST_MODIFIED,
    })
    response.end(`${domain}\n`)
  }
}

describe('syncBlacklistSourceById', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends production request options, then conditional validators, and a 304 keeps the synced domains', async () => {
    const domain = `validated-${sourceNameSuffix()}.example`
    const { url, seen } = await serveSource(respondValidated(domain))
    const sourceId = await createSource('url', url('/list.txt'))
    const fetchSpy = vi.spyOn(undici, 'fetch')
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
    const enqueue = vi.spyOn(bloomEnqueues, 'enqueueRebuildBloomFilter')

    await expect(syncBlacklistSourceById(sourceId)).resolves.toBeUndefined()

    const timeoutIndex = timeoutSpy.mock.calls.findIndex(([ms]) => ms === 30_000)
    expect(timeoutIndex).toBeGreaterThanOrEqual(0)
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(url('/list.txt'), {
      dispatcher: getExternalRequestDispatcher(),
      headers: { 'Accept-Encoding': 'gzip, deflate, br' },
      redirect: 'follow',
      signal: timeoutSpy.mock.results[timeoutIndex]!.value,
    })
    expect(seen).toHaveLength(1)
    expect(seen[0]!.method).toBe('GET')
    expect(seen[0]!.headers['accept-encoding']).toBe('gzip, deflate, br')
    expect(seen[0]!.headers['if-none-match']).toBeUndefined()
    expect(seen[0]!.headers['if-modified-since']).toBeUndefined()
    await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual([domain])
    await expect(getSourceCacheHeaders(sourceId)).resolves.toMatchObject({
      etag: ETAG,
      last_modified_at: new Date(LAST_MODIFIED),
      membership_diff_applied_at: expect.any(Date),
    })
    expect(enqueue).toHaveBeenCalledExactlyOnceWith({ filter: 'url-blocklist' })
    const fetchedAfterSync = await getTestBlacklistSourceLastFetchedAt(sourceId)
    expect(fetchedAfterSync).toBeInstanceOf(Date)

    enqueue.mockClear()
    await expect(syncBlacklistSourceById(sourceId)).resolves.toBeUndefined()

    expect(seen).toHaveLength(2)
    expect(seen[1]!.headers['if-none-match']).toBe(ETAG)
    expect(seen[1]!.headers['if-modified-since']).toBe(LAST_MODIFIED)
    await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual([domain])
    await expect(getSourceCacheHeaders(sourceId)).resolves.toMatchObject({
      etag: ETAG,
      last_modified_at: new Date(LAST_MODIFIED),
    })
    expect(enqueue).not.toHaveBeenCalled()
    expect((await getTestBlacklistSourceLastFetchedAt(sourceId))!.getTime()).toBeGreaterThan(
      fetchedAfterSync!.getTime(),
    )
  })

  it('follows a redirect to the list', async () => {
    const domain = `redirected-${sourceNameSuffix()}.example`
    const { url, seen } = await serveSource((request, response) => {
      if (request.url === '/moved.txt') {
        response.writeHead(302, { Location: '/list.txt' })
        response.end()
        return
      }
      response.writeHead(200, { 'Content-Type': 'text/plain' })
      response.end(`${domain}\n`)
    })
    const sourceId = await createSource('url', url('/moved.txt'))

    await syncBlacklistSourceById(sourceId)

    expect(seen.map(request => request.url)).toEqual(['/moved.txt', '/list.txt'])
    await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual([domain])
  })

  it('queues an email rebuild when an email source syncs', async () => {
    const domain = `email-${sourceNameSuffix()}.example`
    const { url } = await serveSource((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/plain' })
      response.end(`${domain}\n`)
    })
    const sourceId = await createSource('email', url('/list.txt'))
    const enqueue = vi.spyOn(bloomEnqueues, 'enqueueRebuildBloomFilter')

    await syncBlacklistSourceById(sourceId)

    await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual([domain])
    expect(enqueue).toHaveBeenCalledExactlyOnceWith({ filter: 'email-blocklist' })
  })

  it.each([
    ['an etag and a last-modified date', LAST_MODIFIED],
    ['only an etag', null],
  ])(
    'rejects a 304 to an unconditional request when the source has %s but never applied a diff',
    async (_name, lastModified) => {
      const { url, seen } = await serveSource((_request, response) => {
        response.writeHead(304)
        response.end()
      })
      const sourceId = await createSource('url', url('/list.txt'))
      await updateSourceCacheHeaders(sourceId, {
        etag: '"old-etag"',
        lastModifiedAt: lastModified ? new Date(lastModified) : null,
      })
      const fetchedBefore = await getTestBlacklistSourceLastFetchedAt(sourceId)

      await expect(syncBlacklistSourceById(sourceId)).rejects.toMatchObject({
        name: 'UnrecoverableError',
        message: 'Blocklist source returned 304 to an unconditional request',
      })

      expect(seen).toHaveLength(1)
      expect(seen[0]!.headers['if-none-match']).toBeUndefined()
      expect(seen[0]!.headers['if-modified-since']).toBeUndefined()
      await expect(getTestBlacklistSourceLastFetchedAt(sourceId)).resolves.toEqual(fetchedBefore)
    },
  )

  it('rethrows replica lag so the source sync backs off', async () => {
    const suffix = sourceNameSuffix()
    const { url } = await serveSource((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/plain' })
      response.end(`stale-${suffix}.example\n`)
    })
    const name = `stale-snapshot-${suffix}`
    const sourceId = await createSource('url', url('/list.txt'), name)
    const kept = `kept-${suffix}.example`
    await insertTestDomainBlacklist(kept, name)
    const readVersion = replicaSourceVersion.readReplicaSourceVersionFromClient
    vi.spyOn(replicaSourceVersion, 'readReplicaSourceVersionFromClient').mockImplementation(
      async (client, sourceIdForCopy) =>
        precedingSourceVersion(await readVersion(client, sourceIdForCopy)),
    )

    await expect(syncBlacklistSourceById(sourceId)).rejects.toBeInstanceOf(ReplicaBehindError)
    await expect(listBlacklistDomainsBySource(sourceId)).resolves.toEqual([kept])
  })

  it('fetches nothing for a missing source and does not fail the job', async () => {
    const fetchSpy = vi.spyOn(undici, 'fetch')

    await expect(syncBlacklistSourceById(2_000_000_000)).resolves.toBeUndefined()

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

function precedingSourceVersion(version: string | null): string {
  if (version === null) return '2'
  const previous = (BigInt(version) - 1n) & 0xffffffffn
  return previous === 0n ? '4294967295' : previous.toString()
}
