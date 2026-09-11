import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPost, getPostAncestors, getPostDescendants } from './posts'

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

vi.mock(
  import('../return-null-for-missing-entity'),
  () =>
    ({
      returnNullForMissingEntity: async (promise: Promise<unknown>) => {
        return promise
      },
    }) as unknown as typeof import('../return-null-for-missing-entity'),
)

describe('post server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue(null)
  })

  it('encodes idOrSlug for getPost', async () => {
    await getPost('abc/ancestors')

    expect(mockGet).toHaveBeenCalledWith('/api/v1/posts/abc%2Fancestors', undefined)
  })

  it('encodes idOrSlug for getPostAncestors', async () => {
    await getPostAncestors('abc/descendants', {
      after: 'cursor-1',
      limit: 5,
      headers: { authorization: 'Bearer token' },
    })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/posts/abc%2Fdescendants/ancestors', {
      headers: { authorization: 'Bearer token' },
      searchParams: { after: 'cursor-1', limit: 5 },
    })
  })

  it('encodes idOrSlug for getPostDescendants', async () => {
    await getPostDescendants('abc/ancestors')

    expect(mockGet).toHaveBeenCalledWith('/api/v1/posts/abc%2Fancestors/descendants', undefined)
  })
})
