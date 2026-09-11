import { it, expect, afterAll, beforeAll, describe } from 'vitest'
import { processBlacklistDispatcher, processBlacklistSourceSync } from '../processors.mts'
import { getBlacklistSourceById } from '@services/urls-domains-blacklist'
import {
  createFetchSafeTestServer,
  type FetchSafeTestServer,
} from '@voucha/test-helpers/fetch-safe-test-server'
import { createTestBlacklistSource, countBlacklistEntriesBySource } from '@voucha/test-helpers'

describe('processors.generated', () => {
  const suffix = Array.from({ length: 8 }, () =>
    String.fromCodePoint(97 + Math.floor(Math.random() * 26)),
  ).join('')

  let server: FetchSafeTestServer | undefined
  let serverStatus: number
  let serverBody: string

  beforeAll(async () => {
    serverStatus = 200
    serverBody = 'sync-test-1.com\nsync-test-2.com\n'
    server = await createFetchSafeTestServer((_req, res) => {
      res.writeHead(serverStatus, { 'Content-Type': 'text/plain' })
      res.end(serverBody)
    })
  })

  afterAll(async () => {
    await server?.close()
  })

  it('processBlacklistDispatcher enqueues source syncs for all sources', async () => {
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `test-processor-source-${suffix}`,
      url: 'https://example.com/blacklist.txt',
    })

    await processBlacklistDispatcher({})

    // Verify our source still exists after the dispatcher ran (it only enqueues, not modifies)
    const source = await getBlacklistSourceById(sourceId)
    expect(source).not.toBeNull()
  })

  // -- processBlacklistSourceSync --

  it('processBlacklistSourceSync syncs domains for a valid source', async () => {
    serverStatus = 200
    serverBody = 'sync-test-1.com\nsync-test-2.com\n'

    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `test-processor-sync-${suffix}`,
      url: server!.url('/list.txt'),
    })

    await processBlacklistSourceSync({ sourceId })

    const count = await countBlacklistEntriesBySource(sourceId)
    expect(count).toBe(2)
  })

  it('processBlacklistSourceSync handles missing source without throwing', async () => {
    await expect(processBlacklistSourceSync({ sourceId: 32000 })).resolves.toBeUndefined()
  })

  it('processBlacklistSourceSync handles sync errors without throwing', async () => {
    serverStatus = 404
    serverBody = 'Not Found'

    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `test-processor-sync-error-${suffix}`,
      url: server!.url('/list.txt'),
    })

    await expect(processBlacklistSourceSync({ sourceId })).resolves.toBeUndefined()
    expect(await countBlacklistEntriesBySource(sourceId)).toBe(0)
  })
})
