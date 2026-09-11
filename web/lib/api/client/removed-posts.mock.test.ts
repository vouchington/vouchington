import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listMyRemovedPosts } from './removed-posts'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      clientApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('./instance'),
)

describe('removed-posts client api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({
      removed_posts: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })
  })

  describe('listMyRemovedPosts', () => {
    it('opts into platform removals when no continuation is given', async () => {
      await listMyRemovedPosts()
      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/removed-posts?include_platform=true')
    })

    it('appends encoded after as query param when continuation is provided', async () => {
      await listMyRemovedPosts('cursor-xyz')
      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/my/removed-posts?include_platform=true&after=cursor-xyz',
      )
    })

    it('URL-encodes special characters in cursor', async () => {
      await listMyRemovedPosts('a+b/c=d')
      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/my/removed-posts?include_platform=true&after=a%2Bb%2Fc%3Dd',
      )
    })
  })
})
