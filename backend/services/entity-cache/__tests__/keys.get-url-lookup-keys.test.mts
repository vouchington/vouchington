import { it, expect, describe } from 'vitest'
import { getUrlLookupKeys } from '../keys.mts'

describe('getUrlLookupKeys', () => {
  it('extracts URL from a bare string', async () => {
    const keys = await getUrlLookupKeys('https://example.com/page')
    expect(keys).toHaveLength(1)
    expect(keys[0]).toContain('example.com')
  })

  it('extracts URL from an object with a url property', async () => {
    const keys = await getUrlLookupKeys({ url: 'https://example.com/page' })
    expect(keys).toHaveLength(1)
    expect(keys[0]).toContain('example.com')
  })

  it('ignores objects without a string url property', async () => {
    const keys = await getUrlLookupKeys({ url: null }, { other: 'https://example.com' })
    expect(keys).toHaveLength(0)
  })

  it('deduplicates equivalent URLs', async () => {
    const keys = await getUrlLookupKeys('https://example.com/page', {
      url: 'https://example.com/page',
    })
    expect(keys).toHaveLength(1)
  })

  it('returns empty array for empty input', async () => {
    const keys = await getUrlLookupKeys()
    expect(keys).toHaveLength(0)
  })
})
