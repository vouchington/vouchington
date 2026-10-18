import { it, expect, describe } from 'vitest'
import { upsertUrlHostnames } from './upsert.mts'
import { getUrlHostnameById } from './get.mts'
import { getLocalHostnamePolicy } from './policies.mts'
import { resolveEmailDomainHostnameId } from '../email-address-validator/email-domain-context.mts'
import { getCrawlHostnameCandidates } from '../crawls/hostname-dispatch-candidates.mts'
import { addUrl } from '../urls/upsert.mts'
import { caches } from '@services/entity-cache/caches'
import { getUrlHostnameByAnyCached } from '../entity-fetch/get.mts'
import { withCommittedPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { createTestUser } from '@voucha/test-helpers'
import { setTestHostnameCrawlSweep } from '@voucha/test-helpers/entities/hostname-crawl-sweeps'
import {
  failNextHostnameCacheDeleteForTest,
  getHostnameCacheInvalidationWorkForTest,
  makeHostnameCacheInvalidationAvailableForTest,
} from '@voucha/test-helpers/hostname-cache-invalidation'
import { drainHostnameCacheInvalidationWork } from '@services/entity-cache/hostname-invalidation-drain'

describe('upsert.generated', () => {
  const suffix = Math.random().toString(36).slice(2, 10)

  it('upsertUrlHostnames creates a new hostname', async () => {
    const testHostname = `upsert-create-${suffix}.example.com`
    const hostnamesMap = await upsertUrlHostnames(null, [testHostname])
    const hostnameId = [...hostnamesMap.values()][0]
    const hostname = [...hostnamesMap.keys()][0]

    expect(hostnameId).toBeDefined()
    expect(hostname).toBe(testHostname)
  })

  it('upsertUrlHostnames normalizes hostname from URL', async () => {
    const testHostname = `upsert-normalize-${suffix}.example.com`
    const hostnamesMap = await upsertUrlHostnames(null, [`https://${testHostname}/path`])
    const hostname = [...hostnamesMap.keys()][0]

    expect(hostname).toBe(testHostname)
  })

  it('upsertUrlHostnames creates multiple hostnames', async () => {
    const h1 = `upsert-multi1-${suffix}.com`
    const h2 = `upsert-multi2-${suffix}.com`
    const h3 = `upsert-multi3-${suffix}.com`
    const hostnamesMap = await upsertUrlHostnames(null, [h1, h2, h3])

    expect(hostnamesMap.size).toBe(3)
    expect(hostnamesMap.has(h1)).toBe(true)
    expect(hostnamesMap.has(h2)).toBe(true)
    expect(hostnamesMap.has(h3)).toBe(true)
  })

  it('upsertUrlHostnames deduplicates hostnames', async () => {
    const testHostname = `upsert-dedup-${suffix}.com`
    const hostnamesMap = await upsertUrlHostnames(null, [testHostname, testHostname, testHostname])

    expect(hostnamesMap.size).toBe(1)
    expect(hostnamesMap.has(testHostname)).toBe(true)
  })

  it('upsertUrlHostnames returns empty map for empty input', async () => {
    const hostnamesMap = await upsertUrlHostnames(null, [])
    expect(hostnamesMap.size).toBe(0)
  })

  it('upsertUrlHostnames defaults is_crawlable to true and is_blocked to false', async () => {
    const hostname = `upsert-defaults-${suffix}.example.com`
    const hostnamesMap = await upsertUrlHostnames(null, [hostname])

    const hostnameId = hostnamesMap.get(hostname)!
    const record = await getUrlHostnameById(hostnameId)
    expect(record).not.toBeNull()
    expect(record!.is_crawlable).toBe(true)
    expect(record!.is_blocked).toBe(false)
  })

  it('upsertUrlHostnames persists inherited parent blocks but keeps Web Risk skips dynamic', async () => {
    const parent = `policy-${crypto.randomUUID()}.example.com`
    const parentMap = await upsertUrlHostnames(null, [parent])
    const parentId = parentMap.get(parent)!
    const { updateUrlHostname } = await import('./update.mts')
    const { updateUrlHostnameBlocked } = await import('@voucha/test-helpers')
    await updateUrlHostnameBlocked(parentId, true)
    await updateUrlHostname(parentId, { should_skip_web_risk: true })

    const child = `sub.${parent}`
    const childMap = await upsertUrlHostnames(null, [child])
    const record = await getUrlHostnameById(childMap.get(child)!)

    expect(record!.is_blocked).toBe(true)
    expect(record!.should_skip_web_risk).toBe(false)
    await updateUrlHostnameBlocked(parentId, false)
    expect(await getLocalHostnamePolicy(child)).toMatchObject({ should_skip_web_risk: true })
    await updateUrlHostname(parentId, { should_skip_web_risk: false })
    expect(await getLocalHostnamePolicy(child)).toMatchObject({ should_skip_web_risk: false })
  })

  it('upsertUrlHostnames updates existing hostname', async () => {
    const testHostname = `upsert-existing-${suffix}.com`
    const hostnamesMap1 = await upsertUrlHostnames(null, [testHostname])
    const hostnameId1 = [...hostnamesMap1.values()][0]

    const hostnamesMap2 = await upsertUrlHostnames(null, [testHostname])
    const hostnameId2 = [...hostnamesMap2.values()][0]

    expect(hostnameId1).toBe(hostnameId2)
  })

  it('keeps an email-only hostname private and out of crawl work', async () => {
    const domain = `email-private-${crypto.randomUUID()}.example.com`
    const hostnameId = await resolveEmailDomainHostnameId(`reader@${domain}`)
    if (!hostnameId) throw new Error('Expected email domain hostname')
    const bucketDays = 31000 + Math.floor(Math.random() * 1000)
    await setTestHostnameCrawlSweep(hostnameId, bucketDays, null)

    expect((await getUrlHostnameById(hostnameId))?.publicly_introduced_at).toBeNull()
    const candidates = await getCrawlHostnameCandidates(
      {
        sweepStartedAt: new Date(Date.now() + 86_400_000).toISOString(),
        rangeLimit: 10,
        afterBucketDays: 0,
        bucketDays,
      },
      10,
    )
    expect(candidates.find(row => row.id === hostnameId)?.has_url).toBe(false)
  })

  it('does not dispatch a public staff hostname until it has URL work', async () => {
    const domain = `staff-url-less-${crypto.randomUUID()}.example.com`
    const staff = await createTestUser({ administrator: true })
    const hostnameId = (await upsertUrlHostnames(staff.id, [domain])).get(domain)
    if (!hostnameId) throw new Error('Expected staff hostname')
    const bucketDays = 29000 + Math.floor(Math.random() * 1000)
    await setTestHostnameCrawlSweep(hostnameId, bucketDays, null)

    expect((await getUrlHostnameById(hostnameId))?.publicly_introduced_at).toBeInstanceOf(Date)
    const candidates = await getCrawlHostnameCandidates(
      {
        sweepStartedAt: new Date(Date.now() + 86_400_000).toISOString(),
        rangeLimit: 10,
        afterBucketDays: 0,
        bucketDays,
      },
      10,
    )
    expect(candidates.find(row => row.id === hostnameId)?.has_url).toBe(false)
  })

  it('promotes a private email hostname once when a URL arrives, retaining its ID', async () => {
    const domain = `email-promoted-${crypto.randomUUID()}.example.com`
    const hostnameId = await resolveEmailDomainHostnameId(`writer@${domain}`)
    if (!hostnameId) throw new Error('Expected email domain hostname')
    const bucketDays = 32000 + Math.floor(Math.random() * 700)
    await setTestHostnameCrawlSweep(hostnameId, bucketDays, null)
    await addUrl(null, `https://${domain}/first`)

    const firstIntroduction = (await getUrlHostnameById(hostnameId))?.publicly_introduced_at
    expect(firstIntroduction).toBeInstanceOf(Date)
    expect(await resolveEmailDomainHostnameId(`other@${domain}`)).toBe(hostnameId)
    expect((await getUrlHostnameById(hostnameId))?.publicly_introduced_at).toEqual(
      firstIntroduction,
    )
    const candidates = await getCrawlHostnameCandidates(
      {
        sweepStartedAt: new Date(Date.now() + 86_400_000).toISOString(),
        rangeLimit: 10,
        afterBucketDays: 0,
        bucketDays,
      },
      10,
    )
    expect(candidates.find(row => row.id === hostnameId)?.has_url).toBe(true)
  })

  it('evicts a cached private hostname after public URL promotion', async () => {
    const domain = `email-cached-${crypto.randomUUID()}.example.com`
    const hostnameId = await resolveEmailDomainHostnameId(`owner@${domain}`)
    if (!hostnameId) throw new Error('Expected email domain hostname')
    const privateHostname = await getUrlHostnameByAnyCached(hostnameId)
    expect(privateHostname?.publicly_introduced_at).toBeNull()
    await caches.url_hostnames.set(hostnameId, privateHostname)
    await caches.url_hostnames.set(domain, privateHostname)

    await addUrl(null, `https://${domain}/first`)

    for (const key of [hostnameId, domain]) {
      const hostname = await getUrlHostnameByAnyCached(key)
      expect(hostname?.id).toBe(hostnameId)
      expect(hostname?.publicly_introduced_at).toBeTruthy()
    }
  })

  it('evicts a promoted hostname only after its transaction commits', async () => {
    const domain = `email-transaction-${crypto.randomUUID()}.example.com`
    const hostnameId = await resolveEmailDomainHostnameId(`owner@${domain}`)
    if (!hostnameId) throw new Error('Expected email domain hostname')
    const privateHostname = await getUrlHostnameByAnyCached(hostnameId)
    await caches.url_hostnames.set(hostnameId, privateHostname)

    await withCommittedPostgresTransactionForTest(async query => {
      await upsertUrlHostnames(null, [domain], { query })
      expect((await getUrlHostnameByAnyCached(hostnameId))?.publicly_introduced_at).toBeNull()
    })

    expect((await getUrlHostnameByAnyCached(hostnameId))?.publicly_introduced_at).toBeTruthy()
  })

  it('retains a committed public promotion for cache retry after eviction fails', async () => {
    const domain = `email-cache-retry-${crypto.randomUUID()}.example.com`
    const hostnameId = await resolveEmailDomainHostnameId(`owner@${domain}`)
    if (!hostnameId) throw new Error('Expected email domain hostname')
    const privateHostname = await getUrlHostnameByAnyCached(hostnameId)
    expect(privateHostname?.publicly_introduced_at).toBeNull()
    await caches.url_hostnames.set(hostnameId, privateHostname)

    const restoreFailure = failNextHostnameCacheDeleteForTest(hostnameId)
    try {
      await upsertUrlHostnames(null, [domain])
    } finally {
      restoreFailure()
    }
    expect((await getUrlHostnameById(hostnameId))?.publicly_introduced_at).toBeInstanceOf(Date)
    expect(await getHostnameCacheInvalidationWorkForTest(hostnameId)).toMatchObject({
      lease_token: null,
      attempt_count: 1,
    })
    await makeHostnameCacheInvalidationAvailableForTest(hostnameId)
    expect(await drainHostnameCacheInvalidationWork({ hostnameIds: [hostnameId] })).toBe(1)
    expect((await getUrlHostnameByAnyCached(hostnameId))?.publicly_introduced_at).toBeInstanceOf(
      Date,
    )
  })
})
