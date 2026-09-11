import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { mockGetPendingTopicClaims } = vi.hoisted(() => ({
  mockGetPendingTopicClaims: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/require-admin'), () => ({
  requireAdmin: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server/topic-claims'), () => ({
  getPendingTopicClaims: mockGetPendingTopicClaims,
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav data-pw='breadcrumbs' />,
}))

vi.mock(import('@/components/admin/topic-claim-review'), () => ({
  TopicClaimReview: ({ claim }: { claim: { id: string } }) => (
    <div data-pw='topic-claim-review'>{claim.id}</div>
  ),
}))

import AdminTopicClaimsPage from './page'

function makeClaim(id: string) {
  return {
    id,
    topic_id: 'topic-1',
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
    verification_token_hash: null,
    verification_token_issued_at: null,
    domain_verified_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

describe('AdminTopicClaimsPage', () => {
  it('renders the page heading', async () => {
    mockGetPendingTopicClaims.mockResolvedValueOnce({ claims: [] })

    render(await AdminTopicClaimsPage())

    expect(screen.getByText('Topic Claims')).toBeVisible()
  })

  it('renders empty state when no claims', async () => {
    mockGetPendingTopicClaims.mockResolvedValueOnce({ claims: [] })

    render(await AdminTopicClaimsPage())

    expect(screen.getByText('No pending claims.')).toBeVisible()
  })

  it('renders TopicClaimReview for each claim', async () => {
    mockGetPendingTopicClaims.mockResolvedValueOnce({
      claims: [makeClaim('claim-1'), makeClaim('claim-2')],
    })

    const { container } = render(await AdminTopicClaimsPage())

    const reviews = container.querySelectorAll('[data-pw="topic-claim-review"]')
    expect(reviews).toHaveLength(2)
    expect(reviews[0]).toHaveTextContent('claim-1')
    expect(reviews[1]).toHaveTextContent('claim-2')
  })

  it('has data-pw on admin container', async () => {
    mockGetPendingTopicClaims.mockResolvedValueOnce({ claims: [] })

    const { container } = render(await AdminTopicClaimsPage())

    expect(container.querySelector('[data-pw="admin-topic-claims"]')).not.toBeNull()
  })
})
