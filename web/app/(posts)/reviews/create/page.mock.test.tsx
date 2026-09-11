import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const {
  mockGetCurrentUser,
  mockGetMyContributionStatus,
  mockGetTopic,
  mockRedirect,
  mockGetEligibleCommunityPostOptions,
  mockPostForm,
  mockHeaders,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetMyContributionStatus: vi.fn<VitestLooseMock>(),
  mockGetTopic: vi.fn<VitestLooseMock>(),
  mockRedirect: vi.fn<VitestLooseMock>((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
  mockGetEligibleCommunityPostOptions: vi.fn<VitestLooseMock>(),
  mockPostForm: vi.fn<VitestLooseMock>(() => <div data-testid='post-form'>post form</div>),
  mockHeaders: vi.fn<VitestLooseMock>().mockResolvedValue({ get: () => null }),
}))

vi.mock(
  import('next/navigation'),
  () => ({ redirect: mockRedirect }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/auth/get-current-user'), () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock(import('next/headers'), () => ({ headers: mockHeaders }))
vi.mock(import('@/lib/api/server'), () => ({
  getMyContributionStatus: mockGetMyContributionStatus,
  getTopic: mockGetTopic,
}))
vi.mock(import('@/components/posts/post-form'), () => ({
  PostForm: mockPostForm,
}))
vi.mock(import('@/components/posts/post-form/community-options'), () => ({
  getEligibleCommunityPostOptions: mockGetEligibleCommunityPostOptions,
}))
vi.mock(import('@/components/posts/contribution-gated-cta'), () => ({
  ContributionGatedCta: ({ actionNoun }: { actionNoun?: string }) => (
    <div data-testid='contribution-gated-cta'>{actionNoun}</div>
  ),
}))
vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))
vi.mock(
  import('@/components/asides/posts-discovery-aside'),
  () =>
    ({
      PostsDiscoveryAside: () => null,
    }) as unknown as typeof import('@/components/asides/posts-discovery-aside'),
)
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))

import CreateReviewPage from './page'

const user = { id: 'user-1', roles: [] }
const allowedStatus = { contribution_status: { allowed: true }, admission: { allowed: true } }
const gatedStatus = {
  contribution_status: { allowed: false, reason: 'account_too_new' },
  admission: { allowed: true },
}
const emptySearchParams = Promise.resolve({})

describe('CreateReviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTopic.mockResolvedValue(null)
    mockGetEligibleCommunityPostOptions.mockResolvedValue({
      communityOptions: [],
      initialCommunitySlug: undefined,
    })
  })

  it('redirects to /login when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    mockGetMyContributionStatus.mockResolvedValue(allowedStatus)
    await expect(CreateReviewPage({ searchParams: emptySearchParams })).rejects.toThrow(
      'redirect:/login',
    )
  })

  it('renders post form when contribution is allowed', async () => {
    mockGetCurrentUser.mockResolvedValue(user)
    mockGetMyContributionStatus.mockResolvedValue(allowedStatus)
    const result = await CreateReviewPage({ searchParams: emptySearchParams })
    render(result)
    expect(screen.getByTestId('post-form')).toBeDefined()
    expect(screen.queryByTestId('contribution-gated-cta')).toBeNull()
  })

  it('passes eligible community options and initial community slug to the post form', async () => {
    mockGetCurrentUser.mockResolvedValue(user)
    mockGetMyContributionStatus.mockResolvedValue(allowedStatus)
    mockGetEligibleCommunityPostOptions.mockResolvedValue({
      communityOptions: [{ id: 'community-1', name: 'Reviews', slug: 'reviews' }],
      initialCommunitySlug: 'reviews',
    })
    const result = await CreateReviewPage({
      searchParams: Promise.resolve({ community: 'reviews' }),
    })
    render(result)

    expect(mockGetEligibleCommunityPostOptions).toHaveBeenCalledWith('review', 'reviews')
    expect(mockPostForm).toHaveBeenCalledWith(
      expect.objectContaining({
        postType: 'review',
        communityOptions: [{ id: 'community-1', name: 'Reviews', slug: 'reviews' }],
        initialCommunitySlug: 'reviews',
      }),
      undefined,
    )
  })

  it('renders CTA and hides form when account_too_new', async () => {
    mockGetCurrentUser.mockResolvedValue(user)
    mockGetMyContributionStatus.mockResolvedValue(gatedStatus)
    const result = await CreateReviewPage({ searchParams: emptySearchParams })
    render(result)
    expect(screen.getByTestId('contribution-gated-cta')).toBeDefined()
    expect(screen.queryByTestId('post-form')).toBeNull()
    expect(screen.getByText('write a review')).toBeDefined()
  })

  it('renders CTA and hides form when email_verification_required', async () => {
    mockGetCurrentUser.mockResolvedValue(user)
    mockGetMyContributionStatus.mockResolvedValue({
      contribution_status: { allowed: false, reason: 'email_verification_required' },
      admission: { allowed: true },
    })
    const result = await CreateReviewPage({ searchParams: emptySearchParams })
    render(result)
    expect(screen.getByTestId('contribution-gated-cta')).toBeDefined()
    expect(screen.queryByTestId('post-form')).toBeNull()
  })

  it('renders CTA and hides form when action limit is reached', async () => {
    mockGetCurrentUser.mockResolvedValue(user)
    mockGetMyContributionStatus.mockResolvedValue({
      contribution_status: { allowed: true },
      admission: {
        allowed: false,
        reason: 'type_limit',
        retry_after_seconds: 60,
      },
    })
    const result = await CreateReviewPage({ searchParams: emptySearchParams })
    render(result)
    expect(screen.getByTestId('contribution-gated-cta')).toBeDefined()
    expect(screen.queryByTestId('post-form')).toBeNull()
  })

  it('renders form when getMyContributionStatus fails', async () => {
    mockGetCurrentUser.mockResolvedValue(user)
    mockGetMyContributionStatus.mockRejectedValue(new Error('API error'))
    const result = await CreateReviewPage({ searchParams: emptySearchParams })
    render(result)
    expect(screen.getByTestId('post-form')).toBeDefined()
    expect(screen.queryByTestId('contribution-gated-cta')).toBeNull()
  })
})
