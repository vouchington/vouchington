import { it, expect, describe } from 'vitest'
import { getUrlHostnameById, getUrlHostnameCrawlerDetailsById } from './get.mts'
import { upsertUrlHostnames } from './upsert.mts'

describe('get.generated', () => {
  const suffix = Math.random().toString(36).slice(2, 10)

  it('getUrlHostnameById returns null when hostname does not exist', async () => {
    const hostname = await getUrlHostnameById('00000000-0000-0000-0000-000000000000')
    expect(hostname).toBeNull()
  })

  it('getUrlHostnameById returns hostname by ID', async () => {
    const testHostname = `get-test-${suffix}.example.com`
    const hostnamesMap = await upsertUrlHostnames(null, [testHostname])
    const hostnameId = [...hostnamesMap.values()][0]

    const retrieved = await getUrlHostnameById(hostnameId)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(hostnameId)
    expect(retrieved!.hostname).toBe(testHostname)
  })

  it('getUrlHostnameCrawlerDetailsById supports primary reads', async () => {
    const testHostname = `get-crawler-primary-${suffix}.example.com`
    const hostnamesMap = await upsertUrlHostnames(null, [testHostname])
    const hostnameId = [...hostnamesMap.values()][0]

    const retrieved = await getUrlHostnameCrawlerDetailsById(hostnameId, { readOnly: false })
    expect(retrieved?.id).toBe(hostnameId)
    expect(retrieved?.hostname).toBe(testHostname)
  })
})
