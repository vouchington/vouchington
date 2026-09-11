import { it, expect, describe } from 'vitest'
import crypto from 'node:crypto'
import { addUrl, addUrls, extractInsertedUrlIds } from './upsert.mts'
import { getUrlByAny } from './get.mts'

describe('upsert.generated', () => {
  it('addUrl creates a new URL', async () => {
    const hostname = `example-${crypto.randomUUID()}.com`
    const url = await addUrl(null, `https://${hostname}/test`)
    expect(url).toBeDefined()
    expect(url!.url).toBe(`https://${hostname}/test`)
    expect(url!.hostname.id).toBeDefined()
    expect(url!.pathname).toBe('/test')
  })

  it('addUrl normalizes URL and creates hostname', async () => {
    const hostname = `example-${crypto.randomUUID()}.com`
    const url = await addUrl(null, `https://${hostname}/path?query=value`)
    expect(url!.url).toBe(`https://${hostname}/path?query=value`)
    expect(url!.pathname).toBe('/path')
    expect(url!.search_params).toBeDefined()
  })

  it('addUrl with content_type creates mime type', async () => {
    const hostname = `example-${crypto.randomUUID()}.com`
    const url = await addUrl(null, `https://${hostname}/test.pdf`, {
      content_type: 'application/pdf',
    })
    expect(url).toBeDefined()
    const retrieved = await getUrlByAny(url!.id)
    expect(retrieved).toBeDefined()
  })

  it('addUrl upgrades http URLs to https', async () => {
    const hostname = `example-${crypto.randomUUID()}.com`
    const url = await addUrl(null, `http://${hostname}/test`)
    expect(url).toBeDefined()
    expect(url!.url).toBe(`https://${hostname}/test`)
  })

  it('addUrl strips URL fragments before storage', async () => {
    const hostname = `example-${crypto.randomUUID()}.com`
    const url = await addUrl(null, `https://${hostname}/test#section`)
    expect(url).toBeDefined()
    expect(url!.url).toBe(`https://${hostname}/test`)
  })

  it('addUrl throws error for non-http(s) scheme', async () => {
    await expect(addUrl(null, `ftp://example-${crypto.randomUUID()}.com/test`)).rejects.toThrow(
      Error,
    )
  })

  it('addUrl returns null for non-public hostnames', async () => {
    await expect(addUrl(null, 'https://localhost/test')).resolves.toBeNull()
  })

  it('addUrl returns null for single-label hostnames', async () => {
    await expect(addUrl(null, 'https://intranet/test')).resolves.toBeNull()
  })

  it('addUrls skips non-public hostnames in mixed batches', async () => {
    const hostname = `example-${crypto.randomUUID()}.com`
    const urls = await addUrls(null, [
      `https://${hostname}/test`,
      'https://localhost/test',
      'https://intranet/test',
    ])

    expect(urls).toHaveLength(1)
    expect(urls[0].url).toBe(`https://${hostname}/test`)
  })

  it('addUrls creates multiple URLs', async () => {
    const hostnameOne = `example-${crypto.randomUUID()}.com`
    const hostnameTwo = `other-${crypto.randomUUID()}.com`
    const urls = await addUrls(null, [
      `https://${hostnameOne}/test1`,
      `https://${hostnameOne}/test2`,
      `https://${hostnameTwo}/test3`,
    ])
    expect(urls).toHaveLength(3)
    expect(urls[0].url).toBe(`https://${hostnameOne}/test1`)
    expect(urls[1].url).toBe(`https://${hostnameOne}/test2`)
    expect(urls[2].url).toBe(`https://${hostnameTwo}/test3`)
  })

  it('addUrl updates existing URL on conflict', async () => {
    const hostname = `example-${crypto.randomUUID()}.com`
    const url1 = await addUrl(null, `https://${hostname}/duplicate`)
    const url2 = await addUrl(null, `https://${hostname}/duplicate`)
    expect(url1!.id).toBe(url2!.id)
    expect(url2!.url).toBe(`https://${hostname}/duplicate`)
  })

  it('addUrls deduplicates repeated URLs in a single call', async () => {
    const hostname = `example-${crypto.randomUUID()}.com`
    const href = `https://${hostname}/page`
    const otherHref = `https://${hostname}/other`
    // Passing the same URL twice must not throw Postgres error 21000
    const urls = await addUrls(null, [href, href, otherHref])
    expect(urls).toHaveLength(2)
    const urlStrings = urls.map(u => u.url)
    expect(urlStrings).toContain(href)
    expect(urlStrings).toContain(otherHref)
  })

  it('addUrls deduplicates fragment variants in a single call', async () => {
    const hostname = `example-${crypto.randomUUID()}.com`
    const href = `https://${hostname}/page`
    const urls = await addUrls(null, [href, `${href}#section`, `${href}#other`])
    expect(urls).toHaveLength(1)
    expect(urls[0].url).toBe(href)
  })

  it('addUrl succeeds with a pathname longer than 255 characters', async () => {
    const hostname = `example-${crypto.randomUUID()}.com`
    const longSlug = 'a'.repeat(290)
    const url = await addUrl(null, `https://${hostname}/${longSlug}`)
    expect(url).toBeDefined()
    expect(url!.pathname).toBe(`/${longSlug}`)
    expect(url!.pathname.length).toBe(291)
  })

  it('addUrl accepts pathname at the 2048-character boundary', async () => {
    // Use a short unique hostname so the full URL stays within the 2083-char url limit:
    // https:// (8) + 12-char host + / + 2047-char content = 2068 chars ≤ 2083
    const uniqueId = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
    const hostname = `t${uniqueId}.io`
    const pathContent = 'a'.repeat(2047)
    const url = await addUrl(null, `https://${hostname}/${pathContent}`)
    expect(url).toBeDefined()
    expect(url!.pathname.length).toBe(2048)
  })

  it('addUrl rejects pathname exceeding the 2048-character limit', async () => {
    const uniqueId = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
    const hostname = `t${uniqueId}.io`
    const pathContent = 'a'.repeat(2048) // pathname = '/' + 2048 = 2049 chars
    await expect(addUrl(null, `https://${hostname}/${pathContent}`)).rejects.toThrow(Error)
  })

  it('extractInsertedUrlIds returns newly inserted URL IDs in hostname and ID order', () => {
    const rows = [
      { hostname_id: 'hostname-2', id: 'id-3', inserted: true },
      { hostname_id: 'hostname-1', id: 'id-2', inserted: false },
      { hostname_id: 'hostname-1', id: 'id-1', inserted: true },
    ]

    expect(extractInsertedUrlIds(rows)).toEqual(['id-1', 'id-3'])
  })
})
