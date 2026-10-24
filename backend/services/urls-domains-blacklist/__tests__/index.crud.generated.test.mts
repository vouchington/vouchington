import { it, expect, describe } from 'vitest'
import {
  getHostnamePolicy,
  getAllBlacklistSources,
  getBlacklistSourceById,
  getSourceCacheHeaders,
  updateSourceCacheHeaders,
} from '../index.mts'
import { addDomainsToBloomFilter } from '../bloom-filter.mts'
import {
  createTestBlacklistSource,
  deleteTestBlacklistSource,
  insertTestDomainBlacklist,
} from '@voucha/test-helpers'

async function isBlocked(hostname: string): Promise<boolean> {
  return (await getHostnamePolicy(hostname)).is_blocked
}

describe('index.generated (CRUD and isUrlBlocked)', () => {
  const suffix = Array.from({ length: 8 }, () =>
    String.fromCodePoint(97 + Math.floor(Math.random() * 26)),
  ).join('')

  it('isUrlBlocked returns false for non-blacklisted domain', async () => {
    const result = await isBlocked(`unblocked-${crypto.randomUUID()}.test`)
    expect(result).toBe(false)
  })

  it('isUrlBlocked returns true for blacklisted domain', async () => {
    const domain = `blocked-url-${suffix}.com`
    await insertTestDomainBlacklist(domain, `test-blacklist-source-${suffix}`)

    // Ensure domain is also in bloom filter if it happens to exist (parallel tests)
    await addDomainsToBloomFilter([domain])

    const result = await isBlocked(domain)
    expect(result).toBe(true)
  })

  it('isUrlBlocked normalizes hostname', async () => {
    const domain = `norm-check-${suffix}.com`
    await insertTestDomainBlacklist(domain, `test-blacklist-source-${suffix}`)

    // Ensure domain is also in bloom filter if it happens to exist (parallel tests)
    await addDomainsToBloomFilter([domain])

    const result = await isBlocked(domain.toUpperCase())
    expect(result).toBe(true)
  })

  it('isUrlBlocked returns true for subdomains of locally blocked hostnames', async () => {
    const { upsertUrlHostnames } = await import('@services/urls-hostnames')
    const { updateUrlHostnameBlocked } = await import('@voucha/test-helpers')
    const domain = `blocked-parent-${crypto.randomUUID()}.example.com`
    const hostnameMap = await upsertUrlHostnames(null, [domain])
    await updateUrlHostnameBlocked(hostnameMap.get(domain)!, true)

    await expect(isBlocked(`www.${domain}`)).resolves.toBe(true)
  })

  it('isUrlBlocked checks email blacklist type correctly', async () => {
    const emailSourceName = `test-email-blacklist-${suffix}`
    await createTestBlacklistSource({
      type: 'email',
      name: emailSourceName,
      url: 'https://example.com/email-blacklist.txt',
    })

    const domain = `email-blocked-${suffix}.com`
    // Insert under the email-type source (insertTestDomainBlacklist finds existing source by name)
    await insertTestDomainBlacklist(domain, emailSourceName)

    // Should NOT be blocked for URLs (only email type should block)
    const result = await isBlocked(domain)
    expect(result).toBe(false)
  })

  it('getAllBlacklistSources returns all sources', async () => {
    const name = `test-blacklist-source-${suffix}`
    const url = 'https://example.com/blacklist.txt'
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name,
      url,
    })

    const sources = await getAllBlacklistSources()

    expect(sources).toContainEqual({ id: sourceId, name, url })
  })

  it('getBlacklistSourceById returns source by id', async () => {
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `test-source-by-id-${suffix}`,
      url: 'https://example.com/test.txt',
    })

    const source = await getBlacklistSourceById(sourceId)
    expect(source).not.toBeNull()
    expect(source!.id).toBe(sourceId)
    expect(source!.name).toBe(`test-source-by-id-${suffix}`)
    expect(source!.url).toBe('https://example.com/test.txt')
  })

  it('getBlacklistSourceById returns null for non-existent id', async () => {
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `test-source-deleted-${suffix}`,
      url: 'https://example.com/deleted.txt',
    })
    await deleteTestBlacklistSource(sourceId)
    const source = await getBlacklistSourceById(sourceId)
    expect(source).toBeNull()
  })

  it('getSourceCacheHeaders and updateSourceCacheHeaders round-trip', async () => {
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `test-cache-headers-${suffix}`,
      url: 'https://example.com/cache.txt',
    })

    // Initially null
    const before = await getSourceCacheHeaders(sourceId)
    expect(before).not.toBeNull()
    expect(before!.etag).toBeNull()
    expect(before!.last_modified_at).toBeNull()

    // Update
    const lastModified = new Date('2025-01-15T10:00:00Z')
    await updateSourceCacheHeaders(sourceId, {
      etag: '"abc123"',
      lastModifiedAt: lastModified,
    })

    const after = await getSourceCacheHeaders(sourceId)
    expect(after!.etag).toBe('"abc123"')
    expect(new Date(after!.last_modified_at!).toISOString()).toBe(lastModified.toISOString())
  })
})
