import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TopicClaim } from '@/types/topic-claims'

const { mockIssueVerificationToken, mockVerifyDomain, mockSubmitForManualReview, mockOnError } =
  vi.hoisted(() => ({
    mockIssueVerificationToken: vi.fn<VitestLooseMock>(),
    mockVerifyDomain: vi.fn<VitestLooseMock>(),
    mockSubmitForManualReview: vi.fn<VitestLooseMock>(),
    mockOnError: vi.fn<VitestLooseMock>(),
  }))

vi.mock(import('@/lib/api/client/topic-claims'), () => ({
  issueVerificationToken: mockIssueVerificationToken,
  verifyDomain: mockVerifyDomain,
  submitForManualReview: mockSubmitForManualReview,
}))

vi.mock(import('@/lib/on-error/on-error'), () => ({ default: mockOnError }))

import { DomainVerificationPanel } from './domain-verification-panel'

function makeClaim(overrides: Partial<TopicClaim> = {}): TopicClaim {
  return {
    id: 'claim-1',
    topic_id: 'topic-1',
    claimant_user_id: 'user-1',
    verification_method: null,
    claimed_role: 'Card issuer',
    evidence: '',
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

const tokenResponse = {
  raw_token: 'tok-abc',
  dns_instructions: { record_type: 'TXT' as const, hostname: 'example.com', value: 'tok-abc' },
  well_known_instructions: {
    url: 'https://example.com/.well-known/voucha',
    file_content: 'tok-abc',
  },
}

describe('DomainVerificationPanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the manual tab for a claim without hostname', () => {
    render(
      <DomainVerificationPanel
        topicIdOrSlug='my-topic'
        claim={makeClaim()}
        onVerified={vi.fn<() => void>()}
        hasHostname={false}
      />,
    )
    expect(screen.getByText(/submit evidence for staff review/i)).toBeInTheDocument()
    expect(screen.queryByText('DNS TXT Record')).not.toBeInTheDocument()
  })

  it('renders DNS and Well-Known tabs when hasHostname is true', () => {
    render(
      <DomainVerificationPanel
        topicIdOrSlug='my-topic'
        claim={makeClaim({ verification_hostname_id: 'hostname-1' })}
        onVerified={vi.fn<() => void>()}
        hasHostname
      />,
    )
    expect(screen.getByRole('tab', { name: 'DNS TXT Record' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Well-Known File' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Submit Evidence' })).toBeInTheDocument()
  })

  it('has data-pw attribute', () => {
    const { container } = render(
      <DomainVerificationPanel
        topicIdOrSlug='my-topic'
        claim={makeClaim()}
        onVerified={vi.fn<() => void>()}
        hasHostname={false}
      />,
    )
    expect(container.querySelector('[data-pw="domain-verification-panel"]')).not.toBeNull()
  })

  it('submit for review button is disabled when evidence is empty', () => {
    render(
      <DomainVerificationPanel
        topicIdOrSlug='my-topic'
        claim={makeClaim()}
        onVerified={vi.fn<() => void>()}
        hasHostname={false}
      />,
    )
    expect(screen.getByRole('button', { name: /submit for review/i })).toBeDisabled()
  })

  it('calls submitForManualReview on manual submit', async () => {
    const onVerified = vi.fn<() => void>()
    const updatedClaim = makeClaim({ submitted_at: '2026-01-02T00:00:00Z' })
    mockSubmitForManualReview.mockResolvedValueOnce({ claim: updatedClaim })

    render(
      <DomainVerificationPanel
        topicIdOrSlug='my-topic'
        claim={makeClaim()}
        onVerified={onVerified}
        hasHostname={false}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(/describe your relationship/i), {
      target: { value: 'We operate this topic.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))

    await waitFor(() =>
      expect(mockSubmitForManualReview).toHaveBeenCalledWith(
        'my-topic',
        'claim-1',
        'We operate this topic.',
      ),
    )
    await waitFor(() => expect(onVerified).toHaveBeenCalledWith(updatedClaim))
  })

  it('routes errors through onError on submitForManualReview failure', async () => {
    const error = new Error('Submit failed')
    mockSubmitForManualReview.mockRejectedValueOnce(error)

    render(
      <DomainVerificationPanel
        topicIdOrSlug='my-topic'
        claim={makeClaim()}
        onVerified={vi.fn<() => void>()}
        hasHostname={false}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(/describe your relationship/i), {
      target: { value: 'We operate this.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))

    await waitFor(() =>
      expect(mockOnError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ fallback: 'An error occurred' }),
      ),
    )
  })

  it('calls issueVerificationToken when Generate token is clicked', async () => {
    mockIssueVerificationToken.mockResolvedValueOnce(tokenResponse)

    render(
      <DomainVerificationPanel
        topicIdOrSlug='my-topic'
        claim={makeClaim({ verification_hostname_id: 'hostname-1' })}
        onVerified={vi.fn<() => void>()}
        hasHostname
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /generate verification token/i }))

    await waitFor(() =>
      expect(mockIssueVerificationToken).toHaveBeenCalledWith('my-topic', 'claim-1'),
    )
    await waitFor(() => expect(screen.getByText('example.com')).toBeInTheDocument())
  })

  it('calls verifyDomain when Verify now is clicked after token issued', async () => {
    mockIssueVerificationToken.mockResolvedValueOnce(tokenResponse)
    const onVerified = vi.fn<() => void>()
    const verifiedClaim = makeClaim({ verified_at: '2026-01-02T00:00:00Z' })
    mockVerifyDomain.mockResolvedValueOnce({ claim: verifiedClaim })

    render(
      <DomainVerificationPanel
        topicIdOrSlug='my-topic'
        claim={makeClaim({ verification_hostname_id: 'hostname-1' })}
        onVerified={onVerified}
        hasHostname
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /generate verification token/i }))
    await waitFor(() => expect(screen.getByText('example.com')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /verify now/i }))

    await waitFor(() => expect(mockVerifyDomain).toHaveBeenCalledWith('my-topic', 'claim-1'))
    await waitFor(() => expect(onVerified).toHaveBeenCalledWith(verifiedClaim))
  })

  it('shows error message on issueVerificationToken failure', async () => {
    mockIssueVerificationToken.mockRejectedValueOnce(new Error('Token failed'))

    render(
      <DomainVerificationPanel
        topicIdOrSlug='my-topic'
        claim={makeClaim({ verification_hostname_id: 'hostname-1' })}
        onVerified={vi.fn<() => void>()}
        hasHostname
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /generate verification token/i }))

    await waitFor(() => expect(screen.getByText('Token failed')).toBeInTheDocument())
  })
})
