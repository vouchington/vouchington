import { describe, expect, it } from 'vitest'
import { updateUrlHostnameBlocked } from '@voucha/test-helpers'
import { getUrlByAny } from './get.mts'
import { setCanonicalUrl } from './set-canonical.mts'
import { addUrl, addUrls } from './upsert.mts'

const runHost = () => `identity-${crypto.randomUUID()}.example.com`

describe('addUrls page identity', () => {
  it('stores tracking variants on one row and finds it by the tracked URL', async () => {
    const host = runHost()
    const clean = await addUrl(null, `https://${host}/page?id=1`)
    const tracked = await addUrl(null, `https://${host}/page?utm_source=x&id=1&fbclid=y`)

    expect(tracked?.id).toBe(clean?.id)
    expect(tracked?.url).toBe(`https://${host}/page?id=1`)
    expect((await getUrlByAny(`https://${host}/page?id=1&utm_medium=z`))?.id).toBe(clean?.id)
  })

  it('points a scheme and www variant at the first row when it is inserted', async () => {
    const host = runHost()
    const first = await addUrl(null, `https://${host}/page`)
    const variant = await addUrl(null, `http://www.${host}/page`)

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

  it('links concurrent first inserts of variants of a new page to one owner', async () => {
    const host = runHost()
    const [first, second] = await Promise.all([
      addUrl(null, `https://${host}/page`),
      addUrl(null, `https://www.${host}/page`),
    ])

    const rows = [first!, second!]
    const owner = rows.find(row => row.canonical_url_id === null)
    expect(owner).toBeDefined()
    expect(rows.filter(row => row.canonical_url_id === owner!.id)).toHaveLength(1)
  })

  it('keeps a trailing slash significant, so /page and /page/ are two unlinked rows', async () => {
    const host = runHost()
    const [plain, slashed] = await addUrls(null, [`https://${host}/page`, `https://${host}/page/`])

    expect(plain?.id).not.toBe(slashed?.id)
    expect(plain?.canonical_url_id).toBeNull()
    expect(slashed?.canonical_url_id).toBeNull()
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

  it('rejects a variant whose canonical owner hostname became blocked', async () => {
    const host = runHost()
    const owner = await addUrl(null, `https://www.${host}/page`)
    await updateUrlHostnameBlocked(owner!.hostname.id, true)

    const error = await addUrl(null, `https://${host}/page`).catch((err: unknown) => err)

    expect(error).toHaveProperty('status', 422)
    expect(error).toHaveProperty('message', `Hostname www.${host} is blocked`)
  })
})
