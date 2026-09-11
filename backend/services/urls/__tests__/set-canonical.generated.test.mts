import { it, expect, beforeAll, describe } from 'vitest'
import { randomUUID } from 'node:crypto'
import { setCanonicalUrl, CircularCanonicalReferenceError } from '../set-canonical.mts'
import { addUrl } from '../upsert.mts'
import { getUrlById } from '../get.mts'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('set-canonical.generated', () => {
  let user: PrivateUser
  // Unique run ID ensures URL paths are fresh each test run (idempotency requirement)
  const runId = randomUUID().slice(0, 8)

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('setCanonicalUrl sets canonical_url_id correctly', async () => {
    const url1 = await addUrl(user.id, `https://example.com/${runId}/original`)
    const url2 = await addUrl(user.id, `https://example.com/${runId}/canonical`)
    await setCanonicalUrl(url1!.id, url2!.id)

    const updatedUrl = await getUrlById(url1!.id)
    expect(updatedUrl!.canonical_url_id).toBe(url2!.id)
  })

  it('setCanonicalUrl throws error for self-reference', async () => {
    const url = await addUrl(user.id, `https://example.com/${runId}/self`)
    await expect(setCanonicalUrl(url!.id, url!.id)).rejects.toThrow(
      'URL cannot be its own canonical',
    )
  })

  it('setCanonicalUrl throws error for circular reference (A -> B -> A)', async () => {
    const urlA = await addUrl(user.id, `https://example.com/${runId}/a`)
    const urlB = await addUrl(user.id, `https://example.com/${runId}/b`)
    // Set A -> B
    await setCanonicalUrl(urlA!.id, urlB!.id)

    // Try to set B -> A (creates circular reference)
    await expect(setCanonicalUrl(urlB!.id, urlA!.id)).rejects.toThrow(
      CircularCanonicalReferenceError,
    )
  })

  it('setCanonicalUrl throws error for circular reference (A -> B -> C -> A)', async () => {
    const urlA = await addUrl(user.id, `https://example.com/${runId}/a2`)
    const urlB = await addUrl(user.id, `https://example.com/${runId}/b2`)
    const urlC = await addUrl(user.id, `https://example.com/${runId}/c2`)
    // Set A -> B
    await setCanonicalUrl(urlA!.id, urlB!.id)

    // Set B -> C
    await setCanonicalUrl(urlB!.id, urlC!.id)

    // Try to set C -> A (creates circular reference)
    await expect(setCanonicalUrl(urlC!.id, urlA!.id)).rejects.toThrow(
      CircularCanonicalReferenceError,
    )
  })

  it('setCanonicalUrl allows long chains up to max depth', async () => {
    const urls = []
    for (let i = 0; i < 10; i++) {
      const url = await addUrl(user.id, `https://example.com/${runId}/chain-${i}`)
      urls.push(url)
    }

    // Create a chain: 0 -> 1 -> 2 -> ... -> 9
    for (let i = 0; i < 9; i++) {
      await setCanonicalUrl(urls[i]!.id, urls[i + 1]!.id)
    }

    // With chain flattening, url0 ends up pointing to the final canonical (url9)
    const url0 = await getUrlById(urls[0]!.id)
    expect(url0!.canonical_url_id).toBe(urls[9]!.id)

    const url8 = await getUrlById(urls[8]!.id)
    expect(url8!.canonical_url_id).toBe(urls[9]!.id)
  })

  it('setCanonicalUrl allows updating canonical_url_id', async () => {
    const url1 = await addUrl(user.id, `https://example.com/${runId}/url1`)
    const url2 = await addUrl(user.id, `https://example.com/${runId}/url2`)
    const url3 = await addUrl(user.id, `https://example.com/${runId}/url3`)
    // Set url1 -> url2
    await setCanonicalUrl(url1!.id, url2!.id)
    let updatedUrl = await getUrlById(url1!.id)
    expect(updatedUrl!.canonical_url_id).toBe(url2!.id)

    // Update to url1 -> url3
    await setCanonicalUrl(url1!.id, url3!.id)
    updatedUrl = await getUrlById(url1!.id)
    expect(updatedUrl!.canonical_url_id).toBe(url3!.id)
  })

  it('setCanonicalUrl allows branching (multiple URLs pointing to same canonical)', async () => {
    const canonical = await addUrl(user.id, `https://example.com/${runId}/canonical-b`)
    const variant1 = await addUrl(user.id, `https://example.com/${runId}/variant1`)
    const variant2 = await addUrl(user.id, `https://example.com/${runId}/variant2`)
    // Both variants point to the same canonical
    await setCanonicalUrl(variant1!.id, canonical!.id)
    await setCanonicalUrl(variant2!.id, canonical!.id)

    const url1 = await getUrlById(variant1!.id)
    const url2 = await getUrlById(variant2!.id)

    expect(url1!.canonical_url_id).toBe(canonical!.id)
    expect(url2!.canonical_url_id).toBe(canonical!.id)
  })

  it('setCanonicalUrl detects cycle when adding to existing chain', async () => {
    const urlA = await addUrl(user.id, `https://example.com/${runId}/a3`)
    const urlB = await addUrl(user.id, `https://example.com/${runId}/b3`)
    const urlC = await addUrl(user.id, `https://example.com/${runId}/c3`)
    const urlD = await addUrl(user.id, `https://example.com/${runId}/d3`)
    // Create chain: A -> B -> C -> D
    await setCanonicalUrl(urlA!.id, urlB!.id)
    await setCanonicalUrl(urlB!.id, urlC!.id)
    await setCanonicalUrl(urlC!.id, urlD!.id)

    // Try to create cycle: D -> B (would create D -> B -> C -> D)
    await expect(setCanonicalUrl(urlD!.id, urlB!.id)).rejects.toThrow(
      CircularCanonicalReferenceError,
    )
  })
})
