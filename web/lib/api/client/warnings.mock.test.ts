import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  issueAdminUserWarning,
  issueCommunityUserWarning,
  getMyWarningsClient,
  getAdminUserWarnings,
} from './warnings'

const { mockPost, mockGet } = vi.hoisted(() => ({
  mockPost: vi.fn<VitestLooseMock>(),
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      clientApi: {
        post: mockPost,
        get: mockGet,
      },
    }) as unknown as typeof import('./instance'),
)

describe('warnings client api helpers', () => {
  beforeEach(() => {
    mockPost.mockReset()
    mockGet.mockReset()
    mockPost.mockResolvedValue({ warning: { id: 'warning-1' } })
    mockGet.mockResolvedValue({
      warnings: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
  })

  describe('issueAdminUserWarning', () => {
    it('calls POST /api/v1/admin/warnings with body', async () => {
      const body = { userId: 'user-1', reason: 'Spam' }
      await issueAdminUserWarning(body)
      expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/warnings', {
        ...body,
        publicMessage: undefined,
        reportId: undefined,
      })
    })

    it('links and resolves a report without sending community scope', async () => {
      await issueAdminUserWarning({
        userId: 'target-user',
        reason: 'Repeated harassment',
        publicMessage: 'Stop contacting this user.',
        reportId: 'report-1',
        resolveReport: false,
      })

      expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/warnings', {
        userId: 'target-user',
        reason: 'Repeated harassment',
        publicMessage: 'Stop contacting this user.',
        reportId: 'report-1',
        resolveReport: true,
      })
    })

    it('rejects warning text beyond backend limits before sending', async () => {
      await expect(
        issueAdminUserWarning({ userId: 'user-1', reason: 'x'.repeat(1001) }),
      ).rejects.toThrow('Warning reason must be 1000 characters or less')
      await expect(
        issueAdminUserWarning({
          userId: 'user-1',
          reason: 'Reason',
          publicMessage: 'x'.repeat(2001),
        }),
      ).rejects.toThrow('Public warning message must be 2000 characters or less')
      expect(mockPost).not.toHaveBeenCalled()
    })
  })

  describe('issueCommunityUserWarning', () => {
    it('calls POST /api/v1/communities/:slug/warnings with body', async () => {
      const body = { userId: 'user-1', reason: 'Spam' }
      await issueCommunityUserWarning('credit-cards', body)
      expect(mockPost).toHaveBeenCalledWith('/api/v1/communities/credit-cards/warnings', body)
    })

    it('encodes community slug in URL', async () => {
      const body = { userId: 'user-1', reason: 'Spam' }
      await issueCommunityUserWarning('my community', body)
      expect(mockPost).toHaveBeenCalledWith('/api/v1/communities/my%20community/warnings', body)
    })
  })

  describe('getMyWarningsClient', () => {
    it('calls GET /api/v1/my/warnings with no params', async () => {
      await getMyWarningsClient()
      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/warnings')
    })

    it('forwards after and limit as query string', async () => {
      await getMyWarningsClient({ after: 'cursor-abc', limit: 10 })
      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/warnings?after=cursor-abc&limit=10')
    })

    it('omits null after cursor from query string', async () => {
      await getMyWarningsClient({ after: null, limit: 5 })
      expect(mockGet).toHaveBeenCalledWith('/api/v1/my/warnings?limit=5')
    })
  })

  describe('getAdminUserWarnings', () => {
    it('calls GET /api/v1/admin/warnings with userId', async () => {
      await getAdminUserWarnings({ userId: 'user-1' })
      expect(mockGet).toHaveBeenCalledWith('/api/v1/admin/warnings?userId=user-1')
    })

    it('forwards after and limit', async () => {
      await getAdminUserWarnings({ userId: 'user-1', after: 'cursor-xyz', limit: 20 })
      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/admin/warnings?userId=user-1&after=cursor-xyz&limit=20',
      )
    })
  })
})
