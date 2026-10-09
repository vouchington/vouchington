import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import * as bloomFilter from '@services/urls-domains-blacklist/bloom-filter'
import {
  createTestBlacklistSource,
  deleteTestBlacklistSource,
  insertTestDomainBlacklist,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { checkDomainBlacklisted } from '../check-domain-blacklisted.mts'

describe('checkDomainBlacklisted', () => {
  const sourceIds: Array<Parameters<typeof deleteTestBlacklistSource>[0]> = []
  let bloomSpy: MockInstance<typeof bloomFilter.checkBloomFilters>
  let enabledSpy: MockInstance<typeof bloomFilter.isUrlBlocklistBloomFilterEnabled>

  beforeEach(() => {
    bloomSpy = vi.spyOn(bloomFilter, 'checkBloomFilters')
    enabledSpy = vi.spyOn(bloomFilter, 'isUrlBlocklistBloomFilterEnabled')
  })

  afterEach(async () => {
    bloomSpy.mockRestore()
    enabledSpy.mockRestore()
    for (const sourceId of sourceIds.splice(0)) await deleteTestBlacklistSource(sourceId)
  })

  async function ownBlocklistedDomain(domain: string): Promise<void> {
    const name = `robots-blocklist-${randomUUID()}`
    sourceIds.push(
      await createTestBlacklistSource({ type: 'url', name, url: 'https://example.com' }),
    )
    await insertTestDomainBlacklist(domain, name)
  }

  it('honors the feature flag: disabled means one database read and no Bloom read', async () => {
    const domain = `robots-flag-off-${randomUUID()}.test`
    await ownBlocklistedDomain(domain)
    enabledSpy.mockReturnValue(false)

    await expect(checkDomainBlacklisted(domain)).resolves.toBe(true)

    expect(bloomSpy).not.toHaveBeenCalled()
  })

  it('keeps its own predicate: a non-crawlable hostname is blacklisted on a Bloom negative', async () => {
    const hostname = `robots-uncrawlable-${randomUUID()}.test`
    await insertTestUrlHostname({ hostname, is_crawlable: false })
    bloomSpy.mockResolvedValue([false])

    await expect(checkDomainBlacklisted(hostname)).resolves.toBe(true)
  })

  it('trusts a Bloom negative for a crawlable hostname without reading blocklisted_domains', async () => {
    const domain = `robots-negative-${randomUUID()}.test`
    await ownBlocklistedDomain(domain)
    bloomSpy.mockResolvedValue([false])

    // The row exists, so only a skipped blocklisted_domains read can answer false.
    await expect(checkDomainBlacklisted(domain)).resolves.toBe(false)
  })

  it('confirms a Bloom maybe and an unknown Bloom answer against blocklisted_domains', async () => {
    const maybeDomain = `robots-maybe-${randomUUID()}.test`
    const unknownDomain = `robots-unknown-${randomUUID()}.test`
    await ownBlocklistedDomain(maybeDomain)
    await ownBlocklistedDomain(unknownDomain)

    bloomSpy.mockResolvedValue([true])
    await expect(checkDomainBlacklisted(maybeDomain)).resolves.toBe(true)
    bloomSpy.mockResolvedValue([null])
    await expect(checkDomainBlacklisted(unknownDomain)).resolves.toBe(true)
    bloomSpy.mockResolvedValue([true])
    await expect(checkDomainBlacklisted(`robots-absent-${randomUUID()}.test`)).resolves.toBe(false)
  })
})
