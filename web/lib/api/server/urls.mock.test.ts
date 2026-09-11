import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UrlListResponseBody } from '@/types/api-responses'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      serverApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('./instance'),
)

vi.mock<typeof import('react')>(import('react'), async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    cache: ((fn: (...args: never[]) => unknown) => fn) as unknown as typeof actual.cache,
  }
})

import { getUrls } from './urls'

const emptyResponse: UrlListResponseBody = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

describe('getUrls', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('calls the API when query is undefined', async () => {
    await expectApiWrapperCall({
      mock: mockGet,
      response: emptyResponse,
      call: () => getUrls(),
      expectedArgs: ['/api/v1/urls', {}],
    })
  })

  it('omits the query parameter when whitespace trims to empty', async () => {
    await expectApiWrapperCall({
      mock: mockGet,
      response: emptyResponse,
      call: () => getUrls({ searchParams: { query: '   ', limit: '50' } }),
      expectedArgs: ['/api/v1/urls', { searchParams: { query: undefined, limit: '50' } }],
    })
  })

  it('does NOT call the API for a 1-character query', async () => {
    const result = await getUrls({ searchParams: { query: 'h' } })
    expect(mockGet).not.toHaveBeenCalled()
    expect(result).toEqual(emptyResponse)
  })

  it('does NOT call the API for a 2-character query', async () => {
    const result = await getUrls({ searchParams: { query: 'ht' } })
    expect(mockGet).not.toHaveBeenCalled()
    expect(result).toEqual(emptyResponse)
  })

  it('does NOT call the API when padded whitespace trims below minimum', async () => {
    const result = await getUrls({ searchParams: { query: '  ab  ' } })
    expect(mockGet).not.toHaveBeenCalled()
    expect(result).toEqual(emptyResponse)
  })

  it('calls the API for a query at the minimum length', async () => {
    await expectApiWrapperCall({
      mock: mockGet,
      response: emptyResponse,
      call: () => getUrls({ searchParams: { query: 'htt' } }),
      expectedArgs: ['/api/v1/urls', { searchParams: { query: 'htt' } }],
    })
  })

  it('trims query whitespace before calling the API', async () => {
    await expectApiWrapperCall({
      mock: mockGet,
      response: emptyResponse,
      call: () => getUrls({ searchParams: { query: '  https://example.com  ', limit: '50' } }),
      expectedArgs: [
        '/api/v1/urls',
        { searchParams: { query: 'https://example.com', limit: '50' } },
      ],
    })
  })
})
