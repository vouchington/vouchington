import { describe, expect, it } from 'vitest'
import { getUrlByAny } from './get.mts'
import { setCanonicalUrl } from './set-canonical.mts'
import { addUrl, addUrls } from './upsert.mts'

const runHost = () => `identity-${crypto.randomUUID()}.example.com`

describe('addUrls page identity', () => {
  it('stores tracking variants on one row and finds it by the tracked URL', async () => {
    const host = runHost()
    const clean = await addUrl(null, `https://${host}/page?id=1`)
    const tracked = await addUrl(null, `https://${host}/page/?utm_source=x&id=1&fbclid=y`)

    expect(tracked?.id).toBe(clean?.id)
    expect(tracked?.url).toBe(`https://${host}/page?id=1`)
    expect((await getUrlByAny(`https://${host}/page/?id=1&utm_medium=z`))?.id).toBe(clean?.id)
  })

  it('points a scheme and www variant at the first row when it is inserted', async () => {
    const host = runHost()
    const first = await addUrl(null, `https://${host}/page`)
    const variant = await addUrl(null, `http://www.${host}/page/`)

    expect(variant?.id).not.toBe(first?.id)
    expect(variant?.canonical_url_id).toBe(first?.id)
    expect(variant?.canonical_hostname_id).toBe(first?.hostname.id)
    expect(first?.canonical_url_id).toBeNull()
    expect((await addUrl(null, `https://www.${host}/page`))?.canonical_url_id).toBe(first?.id)
  })

  it('makes the oldest row of one batch canonical for its variants', async () => {
    const host = runHost()
    const [first, second, third] = await addUrls(null, [
      `https://m.${host}/page`,
      `https://${host}/page`,
      `https://www.${host}/page`,
    ])

    const rows = [first!, second!, third!]
    const owner = rows.toSorted((left, right) => left.id.localeCompare(right.id))[0]!
    expect(owner.canonical_url_id).toBeNull()
    for (const row of rows.filter(candidate => candidate.id !== owner.id))
      expect(row.canonical_url_id).toBe(owner.id)
  })

  it('points a new variant at the end of the owner canonical chain', async () => {
    const host = runHost()
    const owner = await addUrl(null, `https://${host}/page`)
    const target = await addUrl(null, `https://${host}/target`)
    await setCanonicalUrl(owner!.id, target!.id)

    const variant = await addUrl(null, `https://www.${host}/page`)

    expect(variant?.canonical_url_id).toBe(target!.id)
    expect(variant?.canonical_hostname_id).toBe(target!.hostname.id)
  })

  it('keeps distinct pages apart', async () => {
    const host = runHost()
    const [page, other] = await addUrls(null, [
      `https://${host}/page?id=1`,
      `https://${host}/page?id=2`,
    ])

    expect(page?.id).not.toBe(other?.id)
    expect(other?.canonical_url_id).toBeNull()
  })
})
