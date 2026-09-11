import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listReviewDisputesClient,
  createReviewDispute,
  updateDisputeDraft,
  approveDispute,
  sendDisputeResolution,
  resolveDisputeRemove,
  resolveDisputeAnnotate,
  dismissDispute,
  rerunDisputeAI,
} from './disputes'

const { mockGet, mockPost, mockPatch } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
  mockPost: vi.fn<VitestLooseMock>(),
  mockPatch: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      clientApi: {
        get: mockGet,
        post: mockPost,
        patch: mockPatch,
      },
    }) as unknown as typeof import('./instance'),
)

describe('disputes client api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPatch.mockReset()
    mockPost.mockResolvedValue({ dispute: { id: 'dispute-1' } })
    mockPatch.mockResolvedValue({ dispute: { id: 'dispute-1' } })
  })

  describe('listReviewDisputesClient', () => {
    it('forwards the continuation cursor and filters', async () => {
      const page = {
        disputes: [],
        page_info: { has_next_page: false, end_cursor: null },
      }
      mockGet.mockResolvedValueOnce(page)

      const result = await listReviewDisputesClient({
        after: 'cursor-1',
        status: 'pending',
        mine: true,
      })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/disputes', {
        searchParams: { limit: 50, after: 'cursor-1', status: 'pending', mine: true },
      })
      expect(result).toBe(page)
    })
  })

  describe('createReviewDispute', () => {
    it('calls POST /api/v1/disputes with data', async () => {
      const data = { post_id: 'post-1', reason: 'factually_inaccurate', claim_text: 'wrong' }
      await createReviewDispute(data)
      expect(mockPost).toHaveBeenCalledWith('/api/v1/disputes', data)
    })
  })

  describe('updateDisputeDraft', () => {
    it('calls PATCH /api/v1/disputes/:id with data', async () => {
      await updateDisputeDraft('dispute-1', { public_response: 'response' })
      expect(mockPatch).toHaveBeenCalledWith('/api/v1/disputes/dispute-1', {
        public_response: 'response',
      })
    })
  })

  describe('approveDispute', () => {
    it('calls POST /api/v1/disputes/:id/approval', async () => {
      await approveDispute('dispute-1')
      expect(mockPost).toHaveBeenCalledWith('/api/v1/disputes/dispute-1/approval', {})
    })
  })

  describe('sendDisputeResolution', () => {
    it('calls POST /api/v1/disputes/:id/delivery', async () => {
      await sendDisputeResolution('dispute-1')
      expect(mockPost).toHaveBeenCalledWith('/api/v1/disputes/dispute-1/delivery', {})
    })
  })

  describe('resolveDisputeRemove', () => {
    it('calls POST /api/v1/disputes/:id/resolution with action remove', async () => {
      await resolveDisputeRemove('dispute-1', 'remove')
      expect(mockPost).toHaveBeenCalledWith('/api/v1/disputes/dispute-1/resolution', {
        action: 'remove',
      })
    })
  })

  describe('resolveDisputeAnnotate', () => {
    it('calls POST /api/v1/disputes/:id/resolution with action annotate and body_text', async () => {
      await resolveDisputeAnnotate('dispute-1', 'annotation text')
      expect(mockPost).toHaveBeenCalledWith('/api/v1/disputes/dispute-1/resolution', {
        action: 'annotate',
        body_text: 'annotation text',
      })
    })
  })

  describe('dismissDispute', () => {
    it('calls POST /api/v1/disputes/:id/resolution with action dismiss', async () => {
      await dismissDispute('dispute-1')
      expect(mockPost).toHaveBeenCalledWith('/api/v1/disputes/dispute-1/resolution', {
        action: 'dismiss',
      })
    })
  })

  describe('rerunDisputeAI', () => {
    it('calls POST /api/v1/disputes/:id/resolution-drafts', async () => {
      mockPost.mockResolvedValueOnce(undefined)
      await rerunDisputeAI('dispute-1')
      expect(mockPost).toHaveBeenCalledWith('/api/v1/disputes/dispute-1/resolution-drafts', {})
    })
  })
})
