import { it, expect, describe } from 'vitest'
import { insertTestUrlHostname } from '@voucha/test-helpers'
import { getUrlHostnameCacheKeys } from '../keys.mts'

describe('getUrlHostnameCacheKeys', () => {
  it('resolves the hostname string when only given the UUID', async () => {
    const hostname = `keys-uuid-only-${Date.now()}-${Math.random().toString(36).slice(2)}.example.com`
    const id = await insertTestUrlHostname({ hostname })

    const keys = await getUrlHostnameCacheKeys(id)

    expect(keys).toContain(id)
    expect(keys).toContain(hostname)
  })

  it('resolves the UUID when only given the hostname string', async () => {
    const hostname = `keys-hostname-only-${Date.now()}-${Math.random().toString(36).slice(2)}.example.com`
    const id = await insertTestUrlHostname({ hostname })

    const keys = await getUrlHostnameCacheKeys(hostname)

    expect(keys).toContain(id)
    expect(keys).toContain(hostname)
  })

  it('resolves both forms from an entity object carrying only id', async () => {
    const hostname = `keys-obj-id-${Date.now()}-${Math.random().toString(36).slice(2)}.example.com`
    const id = await insertTestUrlHostname({ hostname })

    const keys = await getUrlHostnameCacheKeys({ id })

    expect(keys).toContain(id)
    expect(keys).toContain(hostname)
  })

  it('resolves both forms from an entity object carrying only hostname', async () => {
    const hostname = `keys-obj-hostname-${Date.now()}-${Math.random().toString(36).slice(2)}.example.com`
    const id = await insertTestUrlHostname({ hostname })

    const keys = await getUrlHostnameCacheKeys({ hostname })

    expect(keys).toContain(id)
    expect(keys).toContain(hostname)
  })

  it('resolves both forms for multiple hostnames in one call, mixing id and string inputs', async () => {
    const hostnameA = `keys-mix-a-${Date.now()}-${Math.random().toString(36).slice(2)}.example.com`
    const hostnameB = `keys-mix-b-${Date.now()}-${Math.random().toString(36).slice(2)}.example.com`
    const idA = await insertTestUrlHostname({ hostname: hostnameA })
    const idB = await insertTestUrlHostname({ hostname: hostnameB })

    const keys = await getUrlHostnameCacheKeys(idA, hostnameB)

    expect(keys).toContain(idA)
    expect(keys).toContain(hostnameA)
    expect(keys).toContain(idB)
    expect(keys).toContain(hostnameB)
  })

  it('resolves case-insensitively', async () => {
    const hostname = `keys-case-${Date.now()}-${Math.random().toString(36).slice(2)}.example.com`
    const id = await insertTestUrlHostname({ hostname })

    const keys = await getUrlHostnameCacheKeys(hostname.toUpperCase())

    expect(keys).toContain(id)
    expect(keys).toContain(hostname)
  })

  it('preserves the input id even when the hostname no longer exists in the DB', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'

    const keys = await getUrlHostnameCacheKeys(fakeId)

    expect(keys).toEqual([fakeId])
  })

  it('preserves the input hostname even when it no longer exists in the DB', async () => {
    const fakeHostname = `keys-deleted-${Date.now()}-${Math.random().toString(36).slice(2)}.example.com`

    const keys = await getUrlHostnameCacheKeys(fakeHostname)

    expect(keys).toEqual([fakeHostname])
  })

  it('returns [] for empty input', async () => {
    const keys = await getUrlHostnameCacheKeys()
    expect(keys).toEqual([])
  })

  it('ignores non-hostname, non-UUID strings', async () => {
    const keys = await getUrlHostnameCacheKeys('not-a-hostname-or-uuid')
    expect(keys).toEqual([])
  })

  it('ignores empty string input', async () => {
    const keys = await getUrlHostnameCacheKeys('')
    expect(keys).toEqual([])
  })

  it('ignores non-string, non-object input', async () => {
    const keys = await getUrlHostnameCacheKeys(null, 123, undefined)
    expect(keys).toEqual([])
  })

  it('ignores an entity object with empty id and hostname fields', async () => {
    const keys = await getUrlHostnameCacheKeys({ id: '', hostname: '' })
    expect(keys).toEqual([])
  })
})
