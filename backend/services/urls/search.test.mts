import { it, expect, describe } from 'vitest'
import { searchUrls } from './search.mts'
import { insertTestUrl, insertTestUrlHostname } from '@voucha/test-helpers'

describe('search', () => {
  async function createSearchableUrl(random: string, index: number): Promise<void> {
    const hostname = `search-limit-${random}-${index}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    await insertTestUrl({ url: `https://${hostname}/page-${index}`, hostnameId })
  }

  it('searchUrls rejects queries shorter than 3 characters', async () => {
    await expect(searchUrls({ query: 'ab' })).rejects.toMatchObject({
      status: 400,
      message: 'URL search query must be at least 3 characters',
    })
  })

  it('searchUrls trims whitespace from query before filtering', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const hostnameId = await insertTestUrlHostname({
      hostname: `search-trim-${random}.example.com`,
    })
    await insertTestUrl({ url: `https://search-trim-${random}.example.com/page`, hostnameId })

    const { results } = await searchUrls({ query: `  ${random}  ` })
    expect(results.some(r => r.url.includes(random))).toBe(true)
  })

  it('searchUrls uses the shared limit clamp', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    for (let index = 0; index < 101; index++) {
      await createSearchableUrl(random, index)
    }

    const minLimited = await searchUrls({ query: random, limit: 0 })
    expect(minLimited.results).toHaveLength(1)
    expect(minLimited.results[0]!.url).toContain(random)

    const defaultLimited = await searchUrls({ query: random, limit: undefined })
    expect(defaultLimited.results).toHaveLength(50)

    const maxLimited = await searchUrls({ query: random, limit: 500 })
    expect(maxLimited.results).toHaveLength(100)
  })
})
