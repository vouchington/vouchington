import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import type { TopicClaim } from '@/types/topic-claims'

const { mockGetTopicClaims, mockGetCurrentUser, mockRedirect, mockHeaders } = vi.hoisted(() => ({
  mockGetTopicClaims: vi.fn<VitestLooseMock>(),
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockRedirect: vi.fn<VitestLooseMock>(),
  mockHeaders: vi.fn<VitestLooseMock>().mockResolvedValue({ get: () => null }),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getTopicClaims: mockGetTopicClaims,
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      ...navMockModule,
      redirect: mockRedirect,
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('next/headers'), () => ({
  headers: mockHeaders,
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav data-pw='breadcrumbs' />,
}))

vi.mock(import('@/components/topic-claims/claim-topic-form'), () => ({
  ClaimTopicForm: ({ onSuccess }: { onSuccess: (claimId: string) => void }) => (
    <button
      type='button'
      data-pw='claim-topic-form'
      aria-label='Complete claim'
      onClick={() => onSuccess('claim-1')}
    />
  ),
}))

vi.mock(import('@/components/topic-claims/domain-verification-panel'), () => ({
  DomainVerificationPanel: ({
    claim,
    onVerified,
  }: {
    claim: TopicClaim
    onVerified: (claim: TopicClaim) => void
  }) => (
    <button
      type='button'
      data-pw='domain-verification-panel'
      aria-label='Complete verification'
      onClick={() => onVerified(claim)}
    />
  ),
}))

import ClaimTopicPage from './page'

const signedInUser = { id: 'user-1', roles: [] }
const mockNav = createNavMock()

describe('ClaimTopicPage', () => {
  beforeEach(() => {
    mockNav.reset()
    vi.clearAllMocks()
  })

  it('redirects to login when not signed in', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)
    mockRedirect.mockImplementationOnce(() => {
      throw new Error('REDIRECT')
    })

    await expect(
      ClaimTopicPage({ params: Promise.resolve({ topicId: 'my-topic' }) }),
    ).rejects.toThrow('REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/login?next=/topic-claims/my-topic')
  })

  it('renders ClaimTopicForm when no existing claim', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(signedInUser)
    mockGetTopicClaims.mockResolvedValueOnce({ claims: [] })

    render(await ClaimTopicPage({ params: Promise.resolve({ topicId: 'my-topic' }) }))

    expect(screen.getByText('Claim this topic')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Complete claim' }))
    expect(mockNav.refresh).toHaveBeenCalledOnce()
  })

  it('renders the page heading when signed in with no existing claim', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(signedInUser)
    mockGetTopicClaims.mockResolvedValueOnce({ claims: [] })

    const { container } = render(
      await ClaimTopicPage({ params: Promise.resolve({ topicId: 'topic-abc' }) }),
    )

    expect(container.querySelector('[data-pw="claim-topic-form"]')).not.toBeNull()
  })

  it('renders DomainVerificationPanel when active claim exists', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(signedInUser)
    mockGetTopicClaims.mockResolvedValueOnce({
      claims: [
        {
          id: 'claim-1',
          topic_id: 'topic-abc',
          claimant_user_id: 'user-1',
          claimed_role: 'Card issuer',
          evidence: '',
          verification_method: null,
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
          verification_token_issued_at: null,
          domain_verified_at: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    })

    const { container } = render(
      await ClaimTopicPage({ params: Promise.resolve({ topicId: 'topic-abc' }) }),
    )

    expect(container.querySelector('[data-pw="domain-verification-panel"]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Complete verification' }))
    expect(mockNav.refresh).toHaveBeenCalledOnce()
  })

  it('renders ClaimTopicForm when existing claim is rejected', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(signedInUser)
    mockGetTopicClaims.mockResolvedValueOnce({
      claims: [
        {
          id: 'claim-rejected',
          topic_id: 'topic-abc',
          claimant_user_id: 'user-1',
          claimed_role: 'Card issuer',
          evidence: '',
          verification_method: null,
          submitted_at: null,
          verified_at: null,
          verified_by_id: null,
          rejected_at: '2026-01-02T00:00:00Z',
          rejected_by_id: 'staff-1',
          rejection_reason: 'Not valid',
          revoked_at: null,
          revoked_by_id: null,
          revocation_reason: null,
          verification_hostname_id: null,
          verification_token_issued_at: null,
          domain_verified_at: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
        },
      ],
    })

    const { container } = render(
      await ClaimTopicPage({ params: Promise.resolve({ topicId: 'topic-abc' }) }),
    )

    expect(container.querySelector('[data-pw="claim-topic-form"]')).not.toBeNull()
  })
})
