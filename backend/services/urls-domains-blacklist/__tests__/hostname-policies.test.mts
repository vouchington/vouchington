import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { bloomFilterConfig } from '@services/bloom-filter-config'
import * as policies from '@services/urls-hostnames/policies'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import {
  createTestBlacklistSource,
  deleteTestBlacklistSource,
  insertTestDomainBlacklist,
  updateUrlHostnameBlocked,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import * as bloomFilter from '../bloom-filter.mts'
import { getHostnamePolicies, getHostnamePolicy } from '../domains.mts'

type BloomRead = Awaited<ReturnType<typeof bloomFilter.checkBloomFilters>>

async function isBlocked(hostname: string): Promise<boolean> {
  return (await getHostnamePolicy(hostname)).is_blocked
}

// domain_blocklist_sources.name only allows lowercase letters and hyphens.
function sourceNameSuffix(): string {
  return Array.from(randomUUID().replaceAll('-', ''), digit =>
    String.fromCodePoint(97 + Number.parseInt(digit, 16)),
  ).join('')
}

describe('hostname policy reads', () => {
  const restores: Array<() => void> = []
  const sourceIds: Array<Parameters<typeof deleteTestBlacklistSource>[0]> = []
  let bloomSpy: MockInstance<typeof bloomFilter.checkBloomFilters>
  let localSpy: MockInstance<typeof policies.getLocalHostnamePolicies>
  let fullSpy: MockInstance<typeof policies.getFullHostnamePolicies>
  let domainSpy: MockInstance<typeof policies.getBlocklistedDomainKeys>

  beforeEach(() => {
    bloomSpy = vi.spyOn(bloomFilter, 'checkBloomFilters')
    localSpy = vi.spyOn(policies, 'getLocalHostnamePolicies')
    fullSpy = vi.spyOn(policies, 'getFullHostnamePolicies')
    domainSpy = vi.spyOn(policies, 'getBlocklistedDomainKeys')
  })

  afterEach(async () => {
    for (const spy of [bloomSpy, localSpy, fullSpy, domainSpy]) spy.mockRestore()
    for (const restore of restores.splice(0)) restore()
    for (const sourceId of sourceIds.splice(0)) await deleteTestBlacklistSource(sourceId)
  })

  function bloomAnswers(answer: (candidates: string[]) => BloomRead): void {
    bloomSpy.mockImplementation(async candidates => answer(candidates))
  }

  async function ownBlocklistedDomain(domain: string): Promise<void> {
    const name = `hostname-policy-${sourceNameSuffix()}`
    sourceIds.push(
      await createTestBlacklistSource({ type: 'url', name, url: 'https://example.com' }),
    )
    await insertTestDomainBlacklist(domain, name)
  }

  function disableBloom(): void {
    restores.push(
      overrideDynamicConfigFieldsForTest(bloomFilterConfig, {
        urlBlocklistBloomFilterEnabled: false,
      }),
    )
  }

  it('answers a Bloom negative from the local read without querying blocklisted_domains', async () => {
    const host = `www.negative-${randomUUID()}.test`
    bloomAnswers(candidates => candidates.map(() => false))

    await expect(getHostnamePolicy(host)).resolves.toEqual({
      is_blocked: false,
      should_skip_web_risk: false,
    })

    expect(localSpy).toHaveBeenCalledTimes(1)
    expect(domainSpy).not.toHaveBeenCalled()
    expect(fullSpy).not.toHaveBeenCalled()
  })

  it('starts the Bloom read and the local read together', async () => {
    const host = `concurrent-${randomUUID()}.test`
    let finishBloom: () => void = () => {}
    bloomSpy.mockImplementation(
      candidates =>
        new Promise<BloomRead>(resolve => {
          finishBloom = () => resolve(candidates.map(() => false))
        }),
    )

    const pending = getHostnamePolicy(host)

    // Both reads were issued before the unresolved Bloom answer: one round trip of depth.
    expect(bloomSpy).toHaveBeenCalledTimes(1)
    expect(localSpy).toHaveBeenCalledTimes(1)
    finishBloom()
    await expect(pending).resolves.toMatchObject({ is_blocked: false })
  })

  it('confirms a Bloom maybe against blocklisted_domains', async () => {
    const domain = `maybe-${randomUUID()}.test`
    await ownBlocklistedDomain(domain)
    bloomAnswers(candidates => candidates.map(() => true))

    await expect(isBlocked(`sub.${domain}`)).resolves.toBe(true)
    expect(domainSpy).toHaveBeenCalledTimes(1)
  })

  it('treats a Bloom false positive as not blocked after the database read', async () => {
    const host = `false-positive-${randomUUID()}.test`
    bloomAnswers(candidates => candidates.map(() => true))

    await expect(isBlocked(host)).resolves.toBe(false)
    expect(domainSpy).toHaveBeenCalledTimes(1)
  })

  it('never short-circuits the database when the filter is not ready', async () => {
    const domain = `not-ready-${randomUUID()}.test`
    await ownBlocklistedDomain(domain)
    bloomAnswers(candidates => candidates.map(() => null))

    await expect(isBlocked(domain)).resolves.toBe(true)
    expect(domainSpy).toHaveBeenCalledTimes(1)
  })

  it('skips blocklisted_domains when url_hostnames already blocks a suffix', async () => {
    const domain = `local-block-${randomUUID()}.test`
    const hostnameMap = await upsertUrlHostnames(null, [domain])
    await updateUrlHostnameBlocked(hostnameMap.get(domain)!, true)
    bloomAnswers(candidates => candidates.map(() => true))

    await expect(isBlocked(`www.${domain}`)).resolves.toBe(true)
    expect(domainSpy).not.toHaveBeenCalled()
  })

  it('returns should_skip_web_risk from the same read that answers blocking', async () => {
    const domain = `skip-${randomUUID()}.test`
    const hostnameMap = await upsertUrlHostnames(null, [domain])
    await updateUrlHostname(hostnameMap.get(domain)!, { should_skip_web_risk: true })
    bloomAnswers(candidates => candidates.map(() => false))

    await expect(getHostnamePolicy(`www.${domain}`)).resolves.toEqual({
      is_blocked: false,
      should_skip_web_risk: true,
    })
    expect(localSpy).toHaveBeenCalledTimes(1)
  })

  it('reads many hostnames in one local query and one domain query', async () => {
    const blockedDomain = `batch-blocked-${randomUUID()}.test`
    const cleanHost = `batch-clean-${randomUUID()}.test`
    await ownBlocklistedDomain(blockedDomain)
    bloomAnswers(candidates => candidates.map(candidate => candidate === blockedDomain))

    const result = await getHostnamePolicies([
      blockedDomain,
      cleanHost,
      blockedDomain.toUpperCase(),
    ])

    expect(result.get(blockedDomain)?.is_blocked).toBe(true)
    expect(result.get(cleanHost)?.is_blocked).toBe(false)
    expect(result.size).toBe(2)
    expect(localSpy).toHaveBeenCalledTimes(1)
    expect(domainSpy).toHaveBeenCalledTimes(1)
    expect(domainSpy.mock.calls[0]![0].map(group => group.key)).toEqual([blockedDomain])
  })

  it('uses one full query and no Bloom read when the feature flag is disabled', async () => {
    const domain = `flag-off-${randomUUID()}.test`
    await ownBlocklistedDomain(domain)
    disableBloom()

    await expect(isBlocked(domain)).resolves.toBe(true)

    expect(bloomSpy).not.toHaveBeenCalled()
    expect(fullSpy).toHaveBeenCalledTimes(1)
    expect(localSpy).not.toHaveBeenCalled()
    expect(domainSpy).not.toHaveBeenCalled()
  })

  it('returns unknown from the Bloom read helper when the feature flag is disabled', async () => {
    bloomSpy.mockRestore()
    disableBloom()

    await expect(bloomFilter.checkBloomFilters(['a.test', 'b.test'])).resolves.toEqual([null, null])
  })

  it('uses the full query for read-after-write callers even when the filter is enabled', async () => {
    const domain = `authoritative-${randomUUID()}.test`
    await ownBlocklistedDomain(domain)
    bloomAnswers(candidates => candidates.map(() => false))

    await expect(getHostnamePolicy(domain, { readOnly: false })).resolves.toMatchObject({
      is_blocked: true,
    })

    expect(bloomSpy).not.toHaveBeenCalled()
    expect(fullSpy).toHaveBeenCalledTimes(1)
  })

  it('makes no query for an empty hostname list', async () => {
    await expect(getHostnamePolicies([])).resolves.toEqual(new Map())
    expect(bloomSpy).not.toHaveBeenCalled()
    expect(localSpy).not.toHaveBeenCalled()
  })
})
