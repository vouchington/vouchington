import undici from 'undici'
import { it, expect, describe, afterEach, vi } from 'vitest'
import { searchWikipediaByTitle, getWikipediaSummary } from './api.mts'

describe('api.generated', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('searchWikipediaByTitle returns results for valid query', async () => {
    vi.spyOn(undici, 'fetch').mockResolvedValueOnce(
      undici.Response.json({
        pages: [
          { id: 18923154, title: 'TypeScript' },
          { id: 28739701, title: 'TypeScript syntax' },
        ],
      }),
    )

    const results = await searchWikipediaByTitle('TypeScript', 2)

    expect(results).toEqual([
      { title: 'TypeScript', pageid: 18923154 },
      { title: 'TypeScript syntax', pageid: 28739701 },
    ])
  })

  it('getWikipediaSummary returns metadata for valid page', async () => {
    vi.spyOn(undici, 'fetch').mockResolvedValueOnce(
      undici.Response.json({
        pageid: 18923154,
        title: 'TypeScript',
        content_urls: {
          desktop: {
            page: 'https://en.wikipedia.org/wiki/TypeScript',
          },
        },
      }),
    )

    const summary = await getWikipediaSummary('TypeScript')

    expect(summary).toEqual({
      pageid: 18923154,
      title: 'TypeScript',
      url: 'https://en.wikipedia.org/wiki/TypeScript',
      extract: null,
      description: null,
      thumbnail_url: null,
    })
  })

  it('getWikipediaSummary returns null for non-existent page', async () => {
    vi.spyOn(undici, 'fetch').mockResolvedValueOnce(new undici.Response(null, { status: 404 }))

    const nonExistentPage = `NonExistentPage${Date.now()}`
    const summary = await getWikipediaSummary(nonExistentPage)

    expect(summary).toBeNull()
  })
})
