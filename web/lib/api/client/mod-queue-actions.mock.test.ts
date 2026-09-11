import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  claimCommunityModerationReport,
  releaseCommunityModerationReport,
  claimCommunityPendingPost,
  releaseCommunityPendingPost,
  openModInternalThreadForReport,
  openModInternalThreadForPost,
  escalateCommunityModerationReport,
  deEscalateCommunityModerationReport,
  escalateCommunityPendingPost,
  deEscalateCommunityPendingPost,
} from './mod-queue-actions'

const { mockPut, mockDelete, mockPost } = vi.hoisted(() => ({
  mockPut: vi.fn<VitestLooseMock>(),
  mockDelete: vi.fn<VitestLooseMock>(),
  mockPost: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      clientApi: {
        put: mockPut,
        delete: mockDelete,
        post: mockPost,
      },
    }) as unknown as typeof import('./instance'),
)

describe('mod-queue-actions client api helpers', () => {
  beforeEach(() => {
    mockPut.mockReset()
    mockDelete.mockReset()
    mockPost.mockReset()
    mockPut.mockResolvedValue({ claim: { id: 'claim-1' }, claimed_by_other: false })
    mockDelete.mockResolvedValue(undefined)
    mockPost.mockResolvedValue({ conversation: { id: 'conv-1' } })
  })

  describe('claimCommunityModerationReport', () => {
    it('calls PUT /api/v1/communities/:slug/reports/:reportId/claim', async () => {
      await claimCommunityModerationReport('my-community', 'report-1')
      expect(mockPut).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/reports/report-1/claim',
        {},
      )
    })

    it('encodes slug and reportId', async () => {
      await claimCommunityModerationReport('my community', 'report/1')
      expect(mockPut).toHaveBeenCalledWith(
        '/api/v1/communities/my%20community/reports/report%2F1/claim',
        {},
      )
    })
  })

  describe('releaseCommunityModerationReport', () => {
    it('calls DELETE /api/v1/communities/:slug/reports/:reportId/claim', async () => {
      await releaseCommunityModerationReport('my-community', 'report-1')
      expect(mockDelete).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/reports/report-1/claim',
      )
    })
  })

  describe('claimCommunityPendingPost', () => {
    it('calls PUT /api/v1/communities/:slug/posts/:postId/claim', async () => {
      await claimCommunityPendingPost('my-community', 'post-1')
      expect(mockPut).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/posts/post-1/claim',
        {},
      )
    })
  })

  describe('releaseCommunityPendingPost', () => {
    it('calls DELETE /api/v1/communities/:slug/posts/:postId/claim', async () => {
      await releaseCommunityPendingPost('my-community', 'post-1')
      expect(mockDelete).toHaveBeenCalledWith('/api/v1/communities/my-community/posts/post-1/claim')
    })
  })

  describe('openModInternalThreadForReport', () => {
    it('calls POST /api/v1/communities/:slug/reports/:reportId/mod-internal-thread', async () => {
      await openModInternalThreadForReport('my-community', 'report-1')
      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/reports/report-1/mod-internal-thread',
        {},
      )
    })
  })

  describe('openModInternalThreadForPost', () => {
    it('calls POST /api/v1/communities/:slug/posts/:postId/mod-internal-thread', async () => {
      await openModInternalThreadForPost('my-community', 'post-1')
      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/posts/post-1/mod-internal-thread',
        {},
      )
    })
  })

  describe('escalateCommunityModerationReport', () => {
    it('calls POST /api/v1/communities/:slug/reports/:reportId/escalation', async () => {
      await escalateCommunityModerationReport('my-community', 'report-1')
      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/reports/report-1/escalation',
        {},
      )
    })
  })

  describe('deEscalateCommunityModerationReport', () => {
    it('calls DELETE /api/v1/communities/:slug/reports/:reportId/escalation', async () => {
      await deEscalateCommunityModerationReport('my-community', 'report-1')
      expect(mockDelete).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/reports/report-1/escalation',
      )
    })
  })

  describe('escalateCommunityPendingPost', () => {
    it('calls POST /api/v1/communities/:slug/posts/:postId/escalation', async () => {
      await escalateCommunityPendingPost('my-community', 'post-1')
      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/posts/post-1/escalation',
        {},
      )
    })
  })

  describe('deEscalateCommunityPendingPost', () => {
    it('calls DELETE /api/v1/communities/:slug/posts/:postId/escalation', async () => {
      await deEscalateCommunityPendingPost('my-community', 'post-1')
      expect(mockDelete).toHaveBeenCalledWith(
        '/api/v1/communities/my-community/posts/post-1/escalation',
      )
    })
  })
})
