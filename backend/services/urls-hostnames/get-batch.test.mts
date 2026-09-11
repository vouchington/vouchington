import { it, expect, describe } from 'vitest'
import { getUrlHostnamesByAnyBatch } from './get-batch.mts'
import { upsertUrlHostnames } from './upsert.mts'

describe('get-batch', () => {
  it('getUrlHostnamesByAnyBatch returns empty array for empty input', async () => {
    const results = await getUrlHostnamesByAnyBatch([])
    expect(results).toEqual([])
  })

  it('getUrlHostnamesByAnyBatch fetches mixed IDs and hostnames in caller order', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`
    const hostname1 = `batch-one-${suffix}.example.com`
    const hostname2 = `batch-two-${suffix}.example.com`
    const hostnamesMap = await upsertUrlHostnames(null, [hostname1, hostname2])

    const results = await getUrlHostnamesByAnyBatch([
      hostname2.toUpperCase(),
      hostnamesMap.get(hostname1)!,
      hostname1,
    ])

    expect(results).toHaveLength(3)
    expect(results[0]?.hostname).toBe(hostname2)
    expect(results[1]?.hostname).toBe(hostname1)
    expect(results[2]?.hostname).toBe(hostname1)
  })

  it('getUrlHostnamesByAnyBatch returns null for non-existent hostnames while preserving order', async () => {
    const results = await getUrlHostnamesByAnyBatch([
      '00000000-0000-0000-0000-000000000001',
      'nonexistent.example.com',
    ])

    expect(results).toHaveLength(2)
    expect(results[0]).toBeNull()
    expect(results[1]).toBeNull()
  })

  it('getUrlHostnamesByAnyBatch throws for invalid identifiers', async () => {
    await expect(getUrlHostnamesByAnyBatch(['invalid!@#'])).rejects.toThrow(
      'Invalid URL hostname identifier',
    )
  })
})
