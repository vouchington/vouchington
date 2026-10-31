import { it, expect, describe } from 'vitest'
import { getUrlByAnyCached, getUrlById } from './get.mts'
import { addUrl } from './upsert.mts'
import {
  createTestBlacklistSource,
  deleteTestBlacklistSource,
  insertTestUrl,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { caches } from '@services/entity-cache/caches'
import { syncDomainsWithDatabase } from '../urls-domains-blacklist-sync/sync-db.mts'

describe('get.generated', () => {
  it('getUrlByAnyCached returns null when URL does not exist', async () => {
    const url = await getUrlByAnyCached('https://nonexistent.example.com/test')
    expect(url).toBeNull()
  })

  it('getUrlById supports primary reads', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const href = `https://example.com/test-primary-read-${random}`
    const createdUrl = await addUrl(null, href)
    const url = await getUrlById(createdUrl!.id, { readOnly: false })
    expect(url?.id).toBe(createdUrl!.id)
    expect(url?.url).toBe(href)
  })

  it('getUrlByAnyCached returns URL by UUID', async () => {
    const createdUrl = await addUrl(null, 'https://example.com/test-uuid')
    const url = await getUrlByAnyCached(createdUrl!.id)
    expect(url).toBeDefined()
    expect(url!.id).toBe(createdUrl!.id)
    expect(url!.url).toBe('https://example.com/test-uuid')
  })

  it('getUrlByAnyCached returns URL by URL string', async () => {
    const createdUrl = await addUrl(null, 'https://example.com/test-string')
    const url = await getUrlByAnyCached('https://example.com/test-string')
    expect(url).toBeDefined()
    expect(url!.id).toBe(createdUrl!.id)
    expect(url!.url).toBe('https://example.com/test-string')
  })

  it('getUrlByAnyCached resolves fragment-bearing URL strings to the stored URL row', async () => {
    const createdUrl = await addUrl(null, 'https://example.com/test-fragment')
    const url = await getUrlByAnyCached('https://example.com/test-fragment#section')
    expect(url).toBeDefined()
    expect(url!.id).toBe(createdUrl!.id)
    expect(url!.url).toBe('https://example.com/test-fragment')
  })

  it('getUrlByAnyCached throws error for invalid URL ID', async () => {
    await expect(getUrlByAnyCached('not-a-uuid-or-url')).rejects.toThrow(
      'Invalid URL identifier: must be a UUID or a valid URL',
    )
  })

  it('getUrlByAnyCached returns null for missing non-public URL hostnames', async () => {
    await expect(getUrlByAnyCached('https://intranet/test')).resolves.toBeNull()
  })

  it('getUrlByAnyCached resolves legacy URL rows with non-public hostnames', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `legacy-${random}.local`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const urlId = await insertTestUrl({ url: `https://${hostname}/test`, hostnameId })

    const url = await getUrlByAnyCached(`https://${hostname}/test#section`)
    expect(url).toBeDefined()
    expect(url!.id).toBe(urlId)
    expect(url!.url).toBe(`https://${hostname}/test`)
  })

  it('reads current hostname policy while keeping the same URL cached across feed changes', async () => {
    const hostname = `cached-url-policy-${crypto.randomUUID()}.example.com`
    const url = await addUrl(null, `https://${hostname}/article`, { skipCreatedEvents: true })
    if (!url) throw new Error('Expected URL fixture')
    const sourceId = await createTestBlacklistSource({
      type: 'url',
      name: `cached-url-${crypto.randomUUID().replaceAll(/[0-9]/g, 'a')}`,
      url: 'https://example.com/cached-url-policy.txt',
    })
    const rawUrl = await getUrlById(url.id)
    if (!rawUrl) throw new Error('Expected persisted URL fixture')
    await caches.urls.set(url.id, rawUrl)
    try {
      expect((await getUrlByAnyCached(url.id))?.hostname.is_blocked).toBe(false)
      const cachedUrl = await caches.urls.get(url.id)
      expect(cachedUrl).not.toBeNull()

      await syncDomainsWithDatabase(sourceId, new Response(`${hostname}\n`), 'url')
      expect(await caches.urls.get(url.id)).toEqual(cachedUrl)
      expect((await getUrlByAnyCached(url.id))?.hostname.is_blocked).toBe(true)

      await syncDomainsWithDatabase(sourceId, new Response(''), 'url')
      expect(await caches.urls.get(url.id)).toEqual(cachedUrl)
      expect((await getUrlByAnyCached(url.id))?.hostname.is_blocked).toBe(false)
    } finally {
      await deleteTestBlacklistSource(sourceId)
    }
  })
})
