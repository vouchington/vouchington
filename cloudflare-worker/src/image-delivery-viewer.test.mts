import { describe, expect, it } from 'vitest'
import { MemoryCache } from '../test-helpers/src/cache.mts'
import {
  authorizeImageDeliveryViewer,
  deliverCachedImagePlacement,
  readTrustedViewerCountry,
  type ImageDeliveryEdgePolicy,
  type TrustedViewerCountry,
} from './image-delivery-viewer.mts'

const restricted: ImageDeliveryEdgePolicy = { effect: 'allow', deniedCountryCodes: ['DE', 'FR'] }
const bytes = new Uint8Array([9, 8, 7])

describe('trusted image delivery country', () => {
  it('delivers an allowed country from the warm cache and denies a restricted country', async () => {
    const cache = new MemoryCache()
    const cacheKey = new Request('https://images.example/placements/one')
    let loads = 0
    const loadBytes = () => {
      loads += 1
      return Promise.resolve(bytes)
    }
    const allowed = await deliverCachedImagePlacement({
      cache,
      cacheKey,
      policy: restricted,
      viewer: known('US'),
      loadBytes,
    })
    expect(loads).toBe(1)
    expect(new Uint8Array(await allowed.arrayBuffer())).toEqual(bytes)

    const warm = await deliverCachedImagePlacement({
      cache,
      cacheKey,
      policy: restricted,
      viewer: known('US'),
      loadBytes,
    })
    expect(loads).toBe(1)
    expect(new Uint8Array(await warm.arrayBuffer())).toEqual(bytes)

    const denied = await deliverCachedImagePlacement({
      cache,
      cacheKey,
      policy: restricted,
      viewer: known('DE'),
      loadBytes,
    })
    expect(loads).toBe(1)
    expect(denied.status).toBe(404)
    expect(await denied.text()).toBe('Unavailable')
    expect(denied.headers.get('cache-control')).toBe('private, no-store')

    const stillWarm = await deliverCachedImagePlacement({
      cache,
      cacheKey,
      policy: restricted,
      viewer: known('US'),
      loadBytes,
    })
    expect(loads).toBe(1)
    expect(new Uint8Array(await stillWarm.arrayBuffer())).toEqual(bytes)
  })

  it('fails closed for unknown geography only when the tuple is country-restricted', async () => {
    const cache = new MemoryCache()
    const cacheKey = new Request('https://images.example/placements/two')
    await cache.put(cacheKey, new Response(bytes))
    const unknown = await deliverCachedImagePlacement({
      cache,
      cacheKey,
      policy: restricted,
      viewer: { attribution: 'unknown' },
      loadBytes: () => Promise.reject(new Error('bytes must stay cached')),
    })
    expect(unknown.status).toBe(404)
    expect(await unknown.text()).toBe('Unavailable')

    const open = await deliverCachedImagePlacement({
      cache,
      cacheKey,
      policy: { effect: 'allow', deniedCountryCodes: [] },
      viewer: { attribution: 'unknown' },
      loadBytes: () => Promise.reject(new Error('open tuples reuse the cache')),
    })
    expect(new Uint8Array(await open.arrayBuffer())).toEqual(bytes)
  })

  it('ignores a caller-supplied country header', () => {
    const spoofed = request({ country: 'US' }, { 'cf-ipcountry': 'DE' })
    expect(readTrustedViewerCountry(spoofed)).toEqual({ attribution: 'known', countryCode: 'US' })
    expect(authorizeImageDeliveryViewer(restricted, readTrustedViewerCountry(spoofed))).toBe(
      'deliver',
    )

    const hidden = request({ country: 'DE' }, { 'cf-ipcountry': 'US' })
    expect(authorizeImageDeliveryViewer(restricted, readTrustedViewerCountry(hidden))).toBe(
      'unavailable',
    )
    expect(readTrustedViewerCountry(request(undefined, { 'cf-ipcountry': 'US' })).attribution).toBe(
      'unknown',
    )
    expect(readTrustedViewerCountry(request({ country: 'XX' }, {})).attribution).toBe('unknown')
    expect(readTrustedViewerCountry(request({ country: 'T1' }, {})).attribution).toBe('unknown')
  })

  it('denies every viewer when the tuple is globally withheld, including a warm cache', async () => {
    const cache = new MemoryCache()
    const cacheKey = new Request('https://images.example/placements/three')
    await cache.put(cacheKey, new Response(bytes))
    const response = await deliverCachedImagePlacement({
      cache,
      cacheKey,
      policy: { effect: 'withheld' },
      viewer: known('US'),
      loadBytes: () => Promise.reject(new Error('global denial must not load bytes')),
    })
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Unavailable')
  })
})

function known(countryCode: string): TrustedViewerCountry {
  return { attribution: 'known', countryCode }
}

function request(cf: { country?: string } | undefined, headers: Record<string, string>) {
  return { cf, headers: new Headers(headers) }
}
