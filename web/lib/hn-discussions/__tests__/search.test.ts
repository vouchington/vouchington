import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchHnDiscussionsForUrls } from '../search'

describe('searchHnDiscussionsForUrls', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('queries story URLs and returns only normalized URL matches', async () => {
    const fetchMock = vi.fn<typeof fetch>(async input => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      expect(new URL(url).origin).toBe('https://hn.algolia.com')
      expect(new URL(url).pathname).toBe('/api/v1/search')
      expect(new URL(url).searchParams.get('query')).toBe('https://example.com/a')
      expect(new URL(url).searchParams.get('restrictSearchableAttributes')).toBe('url')
      expect(new URL(url).searchParams.get('tags')).toBe('story')
      expect(new URL(url).searchParams.get('hitsPerPage')).toBe('5')
      return Response.json({
        hits: [
          {
            objectID: '123',
            title: ' Example ',
            url: 'https://example.com/a/',
            points: 42,
            num_comments: 18,
          },
          {
            objectID: '999',
            title: 'Other site',
            url: 'https://other.example/a',
            points: 1,
            num_comments: 0,
          },
          { objectID: '124', title: '', url: 'https://example.com/a', points: 2, num_comments: 2 },
        ],
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(searchHnDiscussionsForUrls(['https://example.com/a'])).resolves.toEqual([
      {
        objectID: '123',
        title: 'Example',
        score: 42,
        commentCount: 18,
        itemUrl: 'https://news.ycombinator.com/item?id=123',
      },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('merges unique threads and fails closed on HTTP errors', async () => {
    const fetchMock = vi.fn<typeof fetch>(async input => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes(encodeURIComponent('https://example.com/fail'))) {
        return new Response('nope', { status: 500 })
      }
      return Response.json({
        hits: [
          {
            objectID: '123',
            title: 'Example',
            url: 'https://example.com/a',
            points: 10,
            num_comments: 4,
          },
        ],
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      searchHnDiscussionsForUrls(['https://example.com/a', 'https://example.com/fail']),
    ).resolves.toEqual([
      {
        objectID: '123',
        title: 'Example',
        score: 10,
        commentCount: 4,
        itemUrl: 'https://news.ycombinator.com/item?id=123',
      },
    ])
  })

  it('dedupes in-flight requests for the same URL', async () => {
    let resolveFetch: ((value: Response) => void) | undefined
    const fetchMock = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>(resolve => {
          resolveFetch = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const first = searchHnDiscussionsForUrls(['https://example.com/a'])
    const second = searchHnDiscussionsForUrls(['https://example.com/a/'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    resolveFetch!(
      Response.json({
        hits: [
          {
            objectID: '1',
            title: 'A',
            url: 'https://example.com/a',
            points: 1,
            num_comments: 0,
          },
        ],
      }),
    )
    await expect(Promise.all([first, second])).resolves.toEqual([
      [
        {
          objectID: '1',
          title: 'A',
          score: 1,
          commentCount: 0,
          itemUrl: 'https://news.ycombinator.com/item?id=1',
        },
      ],
      [
        {
          objectID: '1',
          title: 'A',
          score: 1,
          commentCount: 0,
          itemUrl: 'https://news.ycombinator.com/item?id=1',
        },
      ],
    ])
  })
})
