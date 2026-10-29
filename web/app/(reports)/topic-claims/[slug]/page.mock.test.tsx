import '@/test-helpers/i18n/mock-json-messages'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from 'vouchington-tooling/next-navigation-mock'
import type { TopicClaim } from '@/types/topic-claims'

const {
  mockGetTopic,
  mockGetTopicClaims,
  mockGetCurrentUser,
  mockRedirect,
  mockPermanentRedirect,
  mockNotFound,
  mockHeaders,
} = vi.hoisted(() => ({
  mockGetTopic: vi.fn<VitestLooseMock>(),
  mockGetTopicClaims: vi.fn<VitestLooseMock>(),
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockRedirect: vi.fn<VitestLooseMock>(),
  mockPermanentRedirect: vi.fn<VitestLooseMock>(() => {
    throw new Error('PERMANENT_REDIRECT')
  }),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('NOT_FOUND')
  }),
  mockHeaders: vi.fn<VitestLooseMock>().mockResolvedValue({ get: () => null }),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getTopic: mockGetTopic,
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
      permanentRedirect: mockPermanentRedirect,
      notFound: mockNotFound,
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

    await expect(ClaimTopicPage({ params: Promise.resolve({ slug: 'my-topic' }) })).rejects.toThrow(
      'REDIRECT',
    )

    expect(mockRedirect).toHaveBeenCalledWith('/login?next=%2Ftopic-claims%2Fmy-topic')
  })

  it('renders ClaimTopicForm when no existing claim', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(signedInUser)
    mockGetTopicClaims.mockResolvedValueOnce({ results: [] })

    render(await ClaimTopicPage({ params: Promise.resolve({ slug: 'my-topic' }) }))

    expect(screen.getByText('Claim this topic')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Complete claim' }))
    expect(mockNav.refresh).toHaveBeenCalledOnce()
  })

  it('renders the page heading when signed in with no existing claim', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(signedInUser)
    mockGetTopicClaims.mockResolvedValueOnce({ results: [] })

    const { container } = render(
      await ClaimTopicPage({ params: Promise.resolve({ slug: 'topic-abc' }) }),
    )

    expect(container.querySelector('[data-pw="claim-topic-form"]')).not.toBeNull()
  })

  it('renders DomainVerificationPanel when active claim exists', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(signedInUser)
    mockGetTopicClaims.mockResolvedValueOnce({
      results: [
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
      await ClaimTopicPage({ params: Promise.resolve({ slug: 'topic-abc' }) }),
    )

    expect(container.querySelector('[data-pw="domain-verification-panel"]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Complete verification' }))
    expect(mockNav.refresh).toHaveBeenCalledOnce()
  })

  it('requests only the caller’s active claims', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(signedInUser)
    mockGetTopicClaims.mockResolvedValueOnce({ results: [] })

    const { container } = render(
      await ClaimTopicPage({ params: Promise.resolve({ slug: 'topic-abc' }) }),
    )

    expect(container.querySelector('[data-pw="claim-topic-form"]')).not.toBeNull()
    expect(mockGetTopicClaims).toHaveBeenCalledWith('topic-abc', true, true)
  })

  it('redirects a signed-in UUID lookup to the topic claim slug', async () => {
    const topicId = '019e0000-0000-7000-8000-000000000001'
    mockGetCurrentUser.mockResolvedValueOnce(signedInUser)
    mockGetTopic.mockResolvedValueOnce({ topic: { id: topicId, slug: 'my-topic' } })

    await expect(ClaimTopicPage({ params: Promise.resolve({ slug: topicId }) })).rejects.toThrow(
      'PERMANENT_REDIRECT',
    )
    expect(mockPermanentRedirect).toHaveBeenCalledWith('/topic-claims/my-topic')
    expect(mockGetTopicClaims).not.toHaveBeenCalled()
  })
})
