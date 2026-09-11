import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
        patch: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import {
  getArticleSyncStatus,
  markPostForReview,
  triggerArticleSync,
  updateAdminReviewQueuePost,
} from '../admin'

const mockGet = vi.mocked(clientApi.get)
const mockPost = vi.mocked(clientApi.post)

describe('admin', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('triggerArticleSync', () => {
    it('POSTs to /api/v1/article-syncs', async () => {
      mockPost.mockResolvedValueOnce({ jobId: 'job-1' })
      const result = await triggerArticleSync()
      expect(mockPost).toHaveBeenCalledWith('/api/v1/article-syncs')
      expect(result).toEqual({ jobId: 'job-1' })
    })
  })

  describe('getArticleSyncStatus', () => {
    it('GETs /api/v1/article-syncs/:jobId', async () => {
      mockGet.mockResolvedValueOnce({
        status: 'completed',
        result: { results: [], summary: { created: 1, updated: 0, skipped: 0, errored: 0 } },
      })
      const result = await getArticleSyncStatus('job-1')
      expect(mockGet).toHaveBeenCalledWith('/api/v1/article-syncs/job-1')
      expect(result).toEqual({
        status: 'completed',
        result: { results: [], summary: { created: 1, updated: 0, skipped: 0, errored: 0 } },
      })
    })
  })

  describe('markPostForReview', () => {
    it('POSTs to /api/v1/posts/:id/clearances with status in_review', async () => {
      mockPost.mockResolvedValueOnce({ clearance_status: 'in_review' })
      const result = await markPostForReview('post-123')
      expect(mockPost).toHaveBeenCalledWith('/api/v1/posts/post-123/clearances', {
        status: 'in_review',
      })
      expect(result).toEqual({ clearance_status: 'in_review' })
    })
  })

  describe('updateAdminReviewQueuePost', () => {
    it('POSTs to the post clearances endpoint with approved status', async () => {
      mockPost.mockResolvedValueOnce({ clearance_status: 'approved' })
      await updateAdminReviewQueuePost('post-1', 'approved')
      expect(mockPost).toHaveBeenCalledWith('/api/v1/posts/post-1/clearances', {
        status: 'approved',
      })
    })

    it('POSTs to the post clearances endpoint with rejected status', async () => {
      mockPost.mockResolvedValueOnce({ clearance_status: 'rejected' })
      await updateAdminReviewQueuePost('post-2', 'rejected')
      expect(mockPost).toHaveBeenCalledWith('/api/v1/posts/post-2/clearances', {
        status: 'rejected',
      })
    })
  })
})
