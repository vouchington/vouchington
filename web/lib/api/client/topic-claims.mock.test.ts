import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTopicClaim,
  issueVerificationToken,
  verifyDomain,
  submitForManualReview,
  adminVerifyTopicClaim,
  adminRejectTopicClaim,
  adminRevokeTopicClaim,
} from './topic-claims'

const { mockPost } = vi.hoisted(() => ({
  mockPost: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      clientApi: {
        post: mockPost,
      },
    }) as unknown as typeof import('./instance'),
)

describe('topic-claims client api helpers', () => {
  beforeEach(() => {
    mockPost.mockReset()
    mockPost.mockResolvedValue({ claim: { id: 'claim-1' } })
  })

  describe('createTopicClaim', () => {
    it('calls POST /api/v1/topics/:id/claims with data', async () => {
      await createTopicClaim('my-topic', { claimed_role: 'Card issuer' })
      expect(mockPost).toHaveBeenCalledWith('/api/v1/topics/my-topic/claims', {
        claimed_role: 'Card issuer',
      })
    })
  })

  describe('issueVerificationToken', () => {
    it('calls POST /api/v1/topics/:id/claims/:claimId/verification-token', async () => {
      mockPost.mockResolvedValueOnce({
        rawToken: 'token',
        dnsInstructions: { recordType: 'TXT', hostname: 'example.com', value: 'token' },
        wellKnownInstructions: {
          url: 'https://example.com/.well-known/voucha',
          fileContent: 'token',
        },
      })
      const result = await issueVerificationToken('my-topic', 'claim-1')
      expect(result).toEqual({
        raw_token: 'token',
        dns_instructions: { record_type: 'TXT', hostname: 'example.com', value: 'token' },
        well_known_instructions: {
          url: 'https://example.com/.well-known/voucha',
          file_content: 'token',
        },
      })
      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/topics/my-topic/claims/claim-1/verification-token',
        {},
      )
    })
  })

  describe('verifyDomain', () => {
    it('calls POST /api/v1/topics/:id/claims/:claimId/domain-verification', async () => {
      await verifyDomain('my-topic', 'claim-1')
      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/topics/my-topic/claims/claim-1/domain-verification',
        {},
      )
    })
  })

  describe('submitForManualReview', () => {
    it('calls POST /api/v1/topics/:id/claims/:claimId/manual-review-submission with evidence', async () => {
      await submitForManualReview('my-topic', 'claim-1', 'We operate this domain.')
      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/topics/my-topic/claims/claim-1/manual-review-submission',
        { evidence: 'We operate this domain.' },
      )
    })
  })

  describe('adminVerifyTopicClaim', () => {
    it('calls POST /api/v1/admin/topic-claims/:id/verification', async () => {
      await adminVerifyTopicClaim('claim-1')
      expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/topic-claims/claim-1/verification', {})
    })
  })

  describe('adminRejectTopicClaim', () => {
    it('calls POST /api/v1/admin/topic-claims/:id/rejection with rejection_reason', async () => {
      await adminRejectTopicClaim('claim-1', 'not verified')
      expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/topic-claims/claim-1/rejection', {
        rejection_reason: 'not verified',
      })
    })
  })

  describe('adminRevokeTopicClaim', () => {
    it('calls POST /api/v1/admin/topic-claims/:id/revocation with revocation_reason', async () => {
      await adminRevokeTopicClaim('claim-1', 'fraudulent claim')
      expect(mockPost).toHaveBeenCalledWith('/api/v1/admin/topic-claims/claim-1/revocation', {
        revocation_reason: 'fraudulent claim',
      })
    })
  })
})
