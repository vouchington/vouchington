import { it, expect, describe } from 'vitest'
import { upsertUrlHostnames } from './upsert.mts'
import { getUrlHostnameById } from './get.mts'
import { getHostnamePolicy } from './policies.mts'

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

  it('upsertUrlHostnames defaults crawlable to true and blocked to false', async () => {
    const hostname = `upsert-defaults-${suffix}.example.com`
    const hostnamesMap = await upsertUrlHostnames(null, [hostname])

    const hostnameId = hostnamesMap.get(hostname)!
    const record = await getUrlHostnameById(hostnameId)
    expect(record).not.toBeNull()
    expect(record!.crawlable).toBe(true)
    expect(record!.blocked).toBe(false)
  })

  it('upsertUrlHostnames persists inherited parent blocks but keeps Web Risk skips dynamic', async () => {
    const parent = `policy-${crypto.randomUUID()}.example.com`
    const parentMap = await upsertUrlHostnames(null, [parent])
    const parentId = parentMap.get(parent)!
    const { updateUrlHostname } = await import('./update.mts')
    const { updateUrlHostnameBlocked } = await import('@voucha/test-helpers')
    await updateUrlHostnameBlocked(parentId, true)
    await updateUrlHostname(parentId, { skip_web_risk: true })

    const child = `sub.${parent}`
    const childMap = await upsertUrlHostnames(null, [child])
    const record = await getUrlHostnameById(childMap.get(child)!)

    expect(record!.blocked).toBe(true)
    expect(record!.skip_web_risk).toBe(false)
    await updateUrlHostnameBlocked(parentId, false)
    expect(await getHostnamePolicy(child)).toMatchObject({ skip_web_risk: true })
    await updateUrlHostname(parentId, { skip_web_risk: false })
    expect(await getHostnamePolicy(child)).toMatchObject({ skip_web_risk: false })
  })

  it('upsertUrlHostnames updates existing hostname', async () => {
    const testHostname = `upsert-existing-${suffix}.com`
    const hostnamesMap1 = await upsertUrlHostnames(null, [testHostname])
    const hostnameId1 = [...hostnamesMap1.values()][0]

    const hostnamesMap2 = await upsertUrlHostnames(null, [testHostname])
    const hostnameId2 = [...hostnamesMap2.values()][0]

    expect(hostnameId1).toBe(hostnameId2)
  })
})
