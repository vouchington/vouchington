import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeRecommendedTopicsResponse } from '@/test-helpers/api-responses'

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

import { getRecommendedTopics } from './recommended-topics'

describe('getRecommendedTopics', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue(makeRecommendedTopicsResponse())
  })

  it('calls the correct endpoint with no options', async () => {
    await getRecommendedTopics()

    expect(mockGet).toHaveBeenCalledWith('/api/v1/recommended-topics', {})
  })

  it('forwards searchParams to the endpoint', async () => {
    await getRecommendedTopics({ searchParams: { limit: 5 } })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/recommended-topics', {
      searchParams: { limit: 5 },
    })
  })
})
