import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        delete: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import { lockPost, unlockPost } from '../posts-lock'

const mockDelete = vi.mocked(clientApi.delete)
const mockPost = vi.mocked(clientApi.post)

describe('posts-lock client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('lockPost', () => {
    it('POSTs to the lock sub-resource', async () => {
      mockPost.mockResolvedValueOnce(undefined)

      await lockPost('post-slug')

      expect(mockPost).toHaveBeenCalledOnce()
      expect(mockPost).toHaveBeenCalledWith('/api/v1/posts/post-slug/lock', {})
    })
  })

  describe('unlockPost', () => {
    it('DELETEs the lock sub-resource', async () => {
      mockDelete.mockResolvedValueOnce(undefined)

      await unlockPost('post-slug')

      expect(mockDelete).toHaveBeenCalledOnce()
      expect(mockDelete).toHaveBeenCalledWith('/api/v1/posts/post-slug/lock')
    })
  })
})
