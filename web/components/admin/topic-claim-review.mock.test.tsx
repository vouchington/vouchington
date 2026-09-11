import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockAdminVerify, mockAdminReject, mockAdminRevoke, mockOnError, mockRefresh } = vi.hoisted(
  () => ({
    mockAdminVerify: vi.fn<VitestLooseMock>(),
    mockAdminReject: vi.fn<VitestLooseMock>(),
    mockAdminRevoke: vi.fn<VitestLooseMock>(),
    mockOnError: vi.fn<VitestLooseMock>(),
    mockRefresh: vi.fn<() => void>(),
  }),
)

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRefresh }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client/topic-claims'), () => ({
  adminVerifyTopicClaim: mockAdminVerify,
  adminRejectTopicClaim: mockAdminReject,
  adminRevokeTopicClaim: mockAdminRevoke,
}))

vi.mock(import('@/lib/on-error/on-error'), () => ({ default: mockOnError }))

import { TopicClaimReview } from './topic-claim-review'
import type { TopicClaim } from '@/types/topic-claims'

function makeClaim(overrides: Partial<TopicClaim> = {}): TopicClaim {
  return {
    id: 'claim-1234',
    topic_id: 'topic-abcd',
    claimant_user_id: 'user-1',
    verification_method: null,
    claimed_role: 'Card issuer',
    evidence: 'See official website.',
    submitted_at: null,
    verified_at: null,
    verified_by_id: null,
    rejected_at: null,
    rejected_by_id: null,
    rejection_reason: null,
    revoked_at: null,
    revoked_by_id: null,
    revocation_reason: null,
    verification_hostname_id: null,
    verification_token_hash: null,
    verification_token_issued_at: null,
    domain_verified_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('TopicClaimReview', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders pending claim with verify and reject controls', () => {
    render(<TopicClaimReview claim={makeClaim()} />)
    expect(screen.getByText(/card issuer/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /verify/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('renders evidence text when present', () => {
    render(<TopicClaimReview claim={makeClaim()} />)
    expect(screen.getByText('See official website.')).toBeInTheDocument()
  })

  it('renders verified claim with revoke control', () => {
    render(<TopicClaimReview claim={makeClaim({ verified_at: '2026-01-02T00:00:00Z' })} />)
    expect(screen.getByRole('button', { name: /revoke/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /verify/i })).not.toBeInTheDocument()
    expect(screen.getByText('verified')).toBeInTheDocument()
  })

  it('calls adminVerifyTopicClaim and refreshes on verify', async () => {
    mockAdminVerify.mockResolvedValueOnce({
      claim: makeClaim({ verified_at: '2026-01-02T00:00:00Z' }),
    })
    render(<TopicClaimReview claim={makeClaim()} />)

    fireEvent.click(screen.getByRole('button', { name: /verify/i }))

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(mockAdminVerify).toHaveBeenCalledWith('claim-1234')
  })

  it('reject button is disabled until reason is entered', () => {
    render(<TopicClaimReview claim={makeClaim()} />)
    expect(screen.getByRole('button', { name: /reject/i })).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText(/rejection reason/i), {
      target: { value: 'Not verified' },
    })
    expect(screen.getByRole('button', { name: /reject/i })).not.toBeDisabled()
  })

  it('calls adminRejectTopicClaim with reason and refreshes', async () => {
    mockAdminReject.mockResolvedValueOnce({
      claim: makeClaim({ rejected_at: '2026-01-02T00:00:00Z' }),
    })
    render(<TopicClaimReview claim={makeClaim()} />)

    fireEvent.change(screen.getByPlaceholderText(/rejection reason/i), {
      target: { value: 'Not a real representative' },
    })
    fireEvent.click(screen.getByRole('button', { name: /reject/i }))

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(mockAdminReject).toHaveBeenCalledWith('claim-1234', 'Not a real representative')
  })

  it('calls adminRevokeTopicClaim with reason and refreshes', async () => {
    mockAdminRevoke.mockResolvedValueOnce({
      claim: makeClaim({ verified_at: '2026-01-02T00:00:00Z', revoked_at: '2026-01-03T00:00:00Z' }),
    })
    render(<TopicClaimReview claim={makeClaim({ verified_at: '2026-01-02T00:00:00Z' })} />)

    fireEvent.change(screen.getByPlaceholderText(/revocation reason/i), {
      target: { value: 'Policy violation' },
    })
    fireEvent.click(screen.getByRole('button', { name: /revoke/i }))

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(mockAdminRevoke).toHaveBeenCalledWith('claim-1234', 'Policy violation')
  })

  it('has data-pw attribute', () => {
    const { container } = render(<TopicClaimReview claim={makeClaim()} />)
    expect(container.querySelector('[data-pw="topic-claim-review"]')).not.toBeNull()
  })
})
