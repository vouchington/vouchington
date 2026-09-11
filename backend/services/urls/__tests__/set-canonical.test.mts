import { describe, expect, it } from 'vitest'
import { createTestUrlWithHostname, getTestUrlCanonicalId } from '@voucha/test-helpers'
import { CircularCanonicalReferenceError, setCanonicalUrl } from '../set-canonical.mts'

describe('setCanonicalUrl', () => {
  it('sets a simple canonical URL', async () => {
    const urlA = await createTestUrlWithHostname()
    const urlB = await createTestUrlWithHostname()
    await setCanonicalUrl(urlA, urlB)
    expect(await getTestUrlCanonicalId(urlA)).toBe(urlB)
  })

  it('rejects self-reference', async () => {
    const urlA = await createTestUrlWithHostname()
    await expect(setCanonicalUrl(urlA, urlA)).rejects.toThrow('URL cannot be its own canonical')
  })

  it('detects circular references', async () => {
    const urlA = await createTestUrlWithHostname()
    const urlB = await createTestUrlWithHostname()
    await setCanonicalUrl(urlA, urlB)
    await expect(setCanonicalUrl(urlB, urlA)).rejects.toThrow(CircularCanonicalReferenceError)
  })

  it('resolves target chain before setting (A->B where B->C exists → A->C)', async () => {
    const urlA = await createTestUrlWithHostname()
    const urlB = await createTestUrlWithHostname()
    const urlC = await createTestUrlWithHostname()
    await setCanonicalUrl(urlB, urlC)
    await setCanonicalUrl(urlA, urlB)
    expect(await getTestUrlCanonicalId(urlA)).toBe(urlC)
  })

  it('flattens back-references when new canonical is set (A->B, then B->C → A->C)', async () => {
    const urlA = await createTestUrlWithHostname()
    const urlB = await createTestUrlWithHostname()
    const urlC = await createTestUrlWithHostname()
    await setCanonicalUrl(urlA, urlB)
    await setCanonicalUrl(urlB, urlC)
    // A should now point to C (flattened)
    expect(await getTestUrlCanonicalId(urlA)).toBe(urlC)
  })

  it('flattens multiple back-references', async () => {
    const urlA = await createTestUrlWithHostname()
    const urlB = await createTestUrlWithHostname()
    const urlC = await createTestUrlWithHostname()
    const urlD = await createTestUrlWithHostname()
    // A->B, C->B
    await setCanonicalUrl(urlA, urlB)
    await setCanonicalUrl(urlC, urlB)
    // Now B->D — both A and C should flatten to D
    await setCanonicalUrl(urlB, urlD)
    expect(await getTestUrlCanonicalId(urlA)).toBe(urlD)
    expect(await getTestUrlCanonicalId(urlC)).toBe(urlD)
  })

  it('detects cycles through chains: A->B, B->C, C->A', async () => {
    const urlA = await createTestUrlWithHostname()
    const urlB = await createTestUrlWithHostname()
    const urlC = await createTestUrlWithHostname()
    await setCanonicalUrl(urlA, urlB)
    await setCanonicalUrl(urlB, urlC)
    await expect(setCanonicalUrl(urlC, urlA)).rejects.toThrow(CircularCanonicalReferenceError)
  })
})
