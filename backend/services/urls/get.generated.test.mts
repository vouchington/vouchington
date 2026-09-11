import { it, expect, describe } from 'vitest'
import { getUrlByAny, getUrlById } from './get.mts'
import { addUrl } from './upsert.mts'
import { insertTestUrl, insertTestUrlHostname } from '@voucha/test-helpers'

describe('get.generated', () => {
  it('getUrlByAny returns null when URL does not exist', async () => {
    const url = await getUrlByAny('https://nonexistent.example.com/test')
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

  it('getUrlByAny returns URL by UUID', async () => {
    const createdUrl = await addUrl(null, 'https://example.com/test-uuid')
    const url = await getUrlByAny(createdUrl!.id)
    expect(url).toBeDefined()
    expect(url!.id).toBe(createdUrl!.id)
    expect(url!.url).toBe('https://example.com/test-uuid')
  })

  it('getUrlByAny returns URL by URL string', async () => {
    const createdUrl = await addUrl(null, 'https://example.com/test-string')
    const url = await getUrlByAny('https://example.com/test-string')
    expect(url).toBeDefined()
    expect(url!.id).toBe(createdUrl!.id)
    expect(url!.url).toBe('https://example.com/test-string')
  })

  it('getUrlByAny resolves fragment-bearing URL strings to the stored URL row', async () => {
    const createdUrl = await addUrl(null, 'https://example.com/test-fragment')
    const url = await getUrlByAny('https://example.com/test-fragment#section')
    expect(url).toBeDefined()
    expect(url!.id).toBe(createdUrl!.id)
    expect(url!.url).toBe('https://example.com/test-fragment')
  })

  it('getUrlByAny throws error for invalid URL ID', async () => {
    await expect(getUrlByAny('not-a-uuid-or-url')).rejects.toThrow(
      'Invalid URL identifier: must be a UUID or a valid URL',
    )
  })

  it('getUrlByAny returns null for missing non-public URL hostnames', async () => {
    await expect(getUrlByAny('https://intranet/test')).resolves.toBeNull()
  })

  it('getUrlByAny resolves legacy URL rows with non-public hostnames', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostname = `legacy-${random}.local`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const urlId = await insertTestUrl({ url: `https://${hostname}/test`, hostnameId })

    const url = await getUrlByAny(`https://${hostname}/test#section`)
    expect(url).toBeDefined()
    expect(url!.id).toBe(urlId)
    expect(url!.url).toBe(`https://${hostname}/test`)
  })
})
