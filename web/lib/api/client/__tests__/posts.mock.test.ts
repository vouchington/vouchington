import { describe, it, expect, vi, afterEach } from 'vitest'
import type { PostMutationResponseBody } from '@/types/api-responses'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        delete: vi.fn<VitestLooseMock>(),
        get: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import {
  createCommunityPost,
  createLinkPost,
  createPost,
  deletePost,
  fetchPostAncestors,
  fetchPostDescendants,
} from '../posts'

const mockDelete = vi.mocked(clientApi.delete)
const mockGet = vi.mocked(clientApi.get)
const mockPost = vi.mocked(clientApi.post)

describe('posts client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('deletePost', () => {
    it('deletes the encoded post identifier', async () => {
      mockDelete.mockResolvedValueOnce(undefined)

      await deletePost('post 1')

      expect(mockDelete).toHaveBeenCalledWith('/api/v1/posts/post%201')
    })

    it('rejects path separators before deleting', async () => {
      await expect(deletePost('post/1')).rejects.toThrow('Invalid identifier')

      expect(mockDelete).not.toHaveBeenCalled()
    })
  })

  describe('createLinkPost', () => {
    it('posts to /api/v1/posts with link type and url_id', async () => {
      mockPost.mockResolvedValueOnce({ post: { id: 'post-1' } })

      await createLinkPost({ url_id: 'url-123' })

      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/posts',
        { post_type: 'link', url_id: 'url-123' },
        { headers: { 'Idempotency-Key': expect.any(String) } },
      )
    })
  })

  describe('createPost', () => {
    it('reuses the admission key after a lost response', async () => {
      mockPost.mockRejectedValueOnce(new Error('network lost')).mockResolvedValueOnce({ post: {} })
      const input = { post_type: 'discussion' as const, markdown: 'Retry me' }

      await expect(createPost(input)).rejects.toThrow('network lost')
      await createPost(input)

      const firstKey = mockPost.mock.calls[0]?.[2]?.headers?.['Idempotency-Key']
      expect(mockPost.mock.calls[1]?.[2]?.headers?.['Idempotency-Key']).toBe(firstKey)
    })
  })

  describe('createCommunityPost', () => {
    it('reuses the admission key when the community slug changes', async () => {
      const options = {
        post_type: 'discussion' as const,
        community_id: 'community-1',
        markdown: 'Retry me',
      }
      mockPost.mockRejectedValueOnce(new Error('network lost')).mockResolvedValueOnce({ post: {} })

      await expect(createCommunityPost('old-community-slug', options)).rejects.toThrow(
        'network lost',
      )
      await createCommunityPost('new-community-slug', options)

      const firstKey = mockPost.mock.calls[0]?.[2]?.headers?.['Idempotency-Key']
      expect(mockPost.mock.calls[1]?.[2]?.headers?.['Idempotency-Key']).toBe(firstKey)
      expect(mockPost.mock.calls[1]?.[0]).toBe('/api/v1/communities/new-community-slug/posts')
    })

    it('posts to the encoded community endpoint with an admission key', async () => {
      const response: PostMutationResponseBody = {
        post: {
          id: 'post-1',
          post_type: 'discussion',
          title: 'Community post',
          markdown: 'Hello',
          root_id: null,
          created_by_id: 'user-1',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          deleted_at: null,
          deleted_by_id: null,
          archived_at: null,
          archived_by_id: null,
          broadcast: 'everyone',
          privacy: 'public',
          is_anonymous: false,
          community_id: 'community-1',
          clearance_status: 'pending',
        },
      }
      const options = {
        post_type: 'discussion' as const,
        community_id: 'community-1',
        markdown: 'Hello',
      }

      await expectApiWrapperCall({
        mock: mockPost,
        response,
        call: () => createCommunityPost('community one', options),
        expectedArgs: [
          '/api/v1/communities/community%20one/posts',
          options,
          { headers: { 'Idempotency-Key': expect.any(String) } },
        ],
      })
    })
  })

  describe('fetchPostDescendants', () => {
    it('forwards pagination options for the encoded post identifier', async () => {
      const page = {
        results: [],
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      }
      mockGet.mockResolvedValueOnce(page)

      const result = await fetchPostDescendants('post one', { after: 'cursor-1', limit: 20 })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/posts/post%20one/descendants', {
        searchParams: { after: 'cursor-1', limit: 20 },
      })
      expect(result).toBe(page)
    })
  })

  describe('fetchPostAncestors', () => {
    it('forwards bounded reverse-pagination options for the encoded post identifier', async () => {
      const page = {
        results: [],
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      }
      mockGet.mockResolvedValueOnce(page)

      const result = await fetchPostAncestors('post one', { after: 'cursor-1', limit: 5 })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/posts/post%20one/ancestors', {
        searchParams: { after: 'cursor-1', limit: 5 },
      })
      expect(result).toBe(page)
    })
  })
})
