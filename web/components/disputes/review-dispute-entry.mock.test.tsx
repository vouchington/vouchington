import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockGetMyTopicClaims } = vi.hoisted(() => ({
  mockGetMyTopicClaims: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server/topic-claims'), () => ({
  getMyTopicClaims: mockGetMyTopicClaims,
}))

vi.mock(import('./dispute-review-button'), () => ({
  DisputeReviewButton: ({ postId, topicId }: { postId: string; topicId: string }) => (
    <button
      type='button'
      data-pw='dispute-review-button'
      data-post-id={postId}
      data-topic-id={topicId}
    >
      Dispute this review
    </button>
  ),
}))

import { ReviewDisputeEntry } from './review-dispute-entry'

const REVIEWED_TOPICS = [{ id: 'topic-1', slug: 'my-topic' }]

const verifiedClaim = {
  id: 'claim-1',
  topic_id: 'topic-1',
  verified_at: '2026-01-01T00:00:00.000Z',
  claimant_user_id: 'user-1',
  claimed_role: 'owner',
  evidence: '',
  submitted_at: null,
  verified_by_id: null,
  rejected_at: null,
  rejected_by_id: null,
  rejection_reason: null,
  revoked_at: null,
  revoked_by_id: null,
  revocation_reason: null,
  verification_hostname_id: null,
  verification_token_issued_at: null,
  domain_verified_at: null,
  verification_method: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

describe('ReviewDisputeEntry', () => {
  it('renders the dispute button when the user has a verified claim for a reviewed topic', async () => {
    mockGetMyTopicClaims.mockResolvedValue({ claims: [verifiedClaim] })

    const result = await ReviewDisputeEntry({ postId: 'post-1', reviewedTopics: REVIEWED_TOPICS })
    render(result)

    const btn = screen.getByRole('button', { name: /dispute this review/i })
    expect(btn).toBeInTheDocument()
    expect(btn.getAttribute('data-pw')).toBe('dispute-review-button')
    expect(btn.getAttribute('data-post-id')).toBe('post-1')
    expect(btn.getAttribute('data-topic-id')).toBe('topic-1')
  })

  it('renders the dispute button for a non-first rated topic (multi-topic review)', async () => {
    const secondTopicClaim = { ...verifiedClaim, id: 'claim-2', topic_id: 'topic-2' }
    mockGetMyTopicClaims.mockResolvedValue({ claims: [secondTopicClaim] })

    const multiTopics = [
      { id: 'topic-1', slug: 'first-topic' },
      { id: 'topic-2', slug: 'second-topic' },
    ]
    const result = await ReviewDisputeEntry({ postId: 'post-1', reviewedTopics: multiTopics })
    render(result)

    const btn = screen.getByRole('button', { name: /dispute this review/i })
    expect(btn).toBeInTheDocument()
    expect(btn.getAttribute('data-topic-id')).toBe('topic-2')
  })

  it('returns null when the user has no verified claim for any reviewed topic', async () => {
    mockGetMyTopicClaims.mockResolvedValue({ claims: [] })

    const result = await ReviewDisputeEntry({ postId: 'post-1', reviewedTopics: REVIEWED_TOPICS })
    expect(result).toBeNull()
  })

  it('returns null when the user has a claim but it is not verified', async () => {
    mockGetMyTopicClaims.mockResolvedValue({
      claims: [{ ...verifiedClaim, verified_at: null }],
    })

    const result = await ReviewDisputeEntry({ postId: 'post-1', reviewedTopics: REVIEWED_TOPICS })
    expect(result).toBeNull()
  })

  it('returns null when the user has a verified claim for a different topic', async () => {
    mockGetMyTopicClaims.mockResolvedValue({
      claims: [{ ...verifiedClaim, topic_id: 'other-topic' }],
    })

    const result = await ReviewDisputeEntry({ postId: 'post-1', reviewedTopics: REVIEWED_TOPICS })
    expect(result).toBeNull()
  })

  it('returns null when the user has a verified but revoked claim for the reviewed topic', async () => {
    mockGetMyTopicClaims.mockResolvedValue({
      claims: [{ ...verifiedClaim, revoked_at: '2026-02-01T00:00:00.000Z' }],
    })

    const result = await ReviewDisputeEntry({ postId: 'post-1', reviewedTopics: REVIEWED_TOPICS })
    expect(result).toBeNull()
  })

  it('returns null when reviewedTopics is empty', async () => {
    mockGetMyTopicClaims.mockResolvedValue({ claims: [verifiedClaim] })

    const result = await ReviewDisputeEntry({ postId: 'post-1', reviewedTopics: [] })
    expect(result).toBeNull()
  })

  it('returns null when getMyTopicClaims returns null (e.g. unauthenticated)', async () => {
    mockGetMyTopicClaims.mockResolvedValue(null)

    const result = await ReviewDisputeEntry({ postId: 'post-1', reviewedTopics: REVIEWED_TOPICS })
    expect(result).toBeNull()
  })
})
