import { it, expect, afterAll, beforeAll, describe } from 'vitest'
import { getHostnamePolicy } from '@services/urls-domains-blacklist'
import { syncBlacklistSourceById } from '../sync.mts'
import { createTestBlacklistSource, countBlacklistEntriesBySource } from '@voucha/test-helpers'
import {
  createFetchSafeTestServer,
  type FetchSafeTestServer,
} from '@voucha/test-helpers/fetch-safe-test-server'

async function isBlocked(hostname: string): Promise<boolean> {
  return (await getHostnamePolicy(hostname)).is_blocked
}

describe('index.generated (syncBlacklistSource)', () => {
  const suffix = Array.from({ length: 8 }, () =>
    String.fromCodePoint(97 + Math.floor(Math.random() * 26)),
  ).join('')

  let server: FetchSafeTestServer | undefined
  let serverContent: string

  beforeAll(async () => {
    serverContent = ''
    server = await createFetchSafeTestServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(serverContent)
    })
  })

  afterAll(async () => {
    await server?.close()
  })

  it('syncBlacklistSource downloads, diffs, and inserts domains from a blocklist source', async () => {
    const url = server!.url('/blocklist.txt')
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `test-sync-source-${suffix}`,
      url,
    })
    serverContent = [
      '# Title: Scam Block List',
      '# Format: domains',
      `malicious-${suffix}.example`,
      `phishing-${suffix}.example`,
      `fraud-${suffix}.example`,
      '',
    ].join('\n')

    // First sync - should add all domains
    await syncBlacklistSourceById(sourceId)

    const count = await countBlacklistEntriesBySource(sourceId)
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThan(2000)

    // Second sync - should detect no changes since same data
    await syncBlacklistSourceById(sourceId)

    const count2 = await countBlacklistEntriesBySource(sourceId)
    expect(count2).toBe(count)
  })

  it('syncBlacklistSource removes domains no longer in list', async () => {
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `test-sync-removal-a-${suffix}`,
      url: server!.url('/list.txt'),
    })
    const domainA = `alpha-${suffix}.com`
    const domainB = `beta-${suffix}.com`
    const domainC = `gamma-${suffix}.com`
    const domainD = `delta-${suffix}.com`

    // First sync with 3 domains
    serverContent = `${domainA}\n${domainB}\n${domainC}\n`
    await syncBlacklistSourceById(sourceId)
    expect(await countBlacklistEntriesBySource(sourceId)).toBe(3)

    // Second sync: remove domainC, add domainD
    serverContent = `${domainA}\n${domainB}\n${domainD}\n`
    await syncBlacklistSourceById(sourceId)
    expect(await countBlacklistEntriesBySource(sourceId)).toBe(3)

    // Verify specific domains
    expect(await isBlocked(domainA)).toBe(true)
    expect(await isBlocked(domainB)).toBe(true)
    expect(await isBlocked(domainD)).toBe(true)
    expect(await isBlocked(domainC)).toBe(false)
  })

  it('syncBlacklistSource handles complete list replacement', async () => {
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `test-sync-replacement-${suffix}`,
      url: server!.url('/list.txt'),
    })

    // First sync
    serverContent = 'old1.com\nold2.com\n'
    await syncBlacklistSourceById(sourceId)
    expect(await countBlacklistEntriesBySource(sourceId)).toBe(2)

    // Second sync - entirely different list
    serverContent = 'new1.com\nnew2.com\nnew3.com\n'
    await syncBlacklistSourceById(sourceId)
    expect(await countBlacklistEntriesBySource(sourceId)).toBe(3)
    expect(await isBlocked('old1.com')).toBe(false)
    expect(await isBlocked('old2.com')).toBe(false)
    expect(await isBlocked('new1.com')).toBe(true)
    expect(await isBlocked('new2.com')).toBe(true)
    expect(await isBlocked('new3.com')).toBe(true)
  })

  it('syncBlacklistSource handles empty new list', async () => {
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `test-sync-empty-${suffix}`,
      url: server!.url('/list.txt'),
    })

    // First sync with domains
    serverContent = 'a.com\nb.com\n'
    await syncBlacklistSourceById(sourceId)
    expect(await countBlacklistEntriesBySource(sourceId)).toBe(2)

    // Second sync with empty list - removes all
    serverContent = ''
    await syncBlacklistSourceById(sourceId)
    expect(await countBlacklistEntriesBySource(sourceId)).toBe(0)
  })

  it('syncBlacklistSource handles empty current DB (first sync)', async () => {
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `test-sync-first-${suffix}`,
      url: server!.url('/list.txt'),
    })

    serverContent = 'first.com\nsecond.com\n'
    await syncBlacklistSourceById(sourceId)
    expect(await countBlacklistEntriesBySource(sourceId)).toBe(2)
  })

  it('syncBlacklistSource skips comment lines and empty lines in input', async () => {
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `test-sync-comments-${suffix}`,
      url: server!.url('/list.txt'),
    })

    serverContent = '# Comment header\n\nalpha.com\n# Another comment\nbeta.com\n\n'
    await syncBlacklistSourceById(sourceId)
    expect(await countBlacklistEntriesBySource(sourceId)).toBe(2)
  })

  it('syncBlacklistSource deduplicates duplicate domains in input', async () => {
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `test-sync-dedup-${suffix}`,
      url: server!.url('/list.txt'),
    })

    serverContent = 'dup.com\ndup.com\nunique.com\ndup.com\n'
    await syncBlacklistSourceById(sourceId)
    expect(await countBlacklistEntriesBySource(sourceId)).toBe(2)

    await syncBlacklistSourceById(sourceId)
    expect(await countBlacklistEntriesBySource(sourceId)).toBe(2)
  })
})
