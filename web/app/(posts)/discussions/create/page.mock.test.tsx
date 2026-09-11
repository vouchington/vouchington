import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const {
  mockGetCurrentUser,
  mockGetMyContributionStatus,
  mockGetUrlsByIds,
  mockGetTopic,
  mockRedirect,
  mockGetEligibleCommunityPostOptions,
  mockPostForm,
  mockHeaders,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetMyContributionStatus: vi.fn<VitestLooseMock>(),
  mockGetUrlsByIds: vi.fn<VitestLooseMock>(),
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
  getUrlsByIds: mockGetUrlsByIds,
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

import CreateDiscussionPage from './page'

const user = { id: 'user-1', roles: [] }
const allowedStatus = { contribution_status: { allowed: true }, admission: { allowed: true } }
const gatedStatus = {
  contribution_status: { allowed: false, reason: 'account_too_new' },
  admission: { allowed: true },
}
const emptySearchParams = Promise.resolve({})

describe('CreateDiscussionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUrlsByIds.mockResolvedValue([])
    mockGetTopic.mockResolvedValue(null)
    mockGetEligibleCommunityPostOptions.mockResolvedValue({
      communityOptions: [],
      initialCommunitySlug: undefined,
    })
  })

  it('redirects to /login when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    mockGetMyContributionStatus.mockResolvedValue(allowedStatus)
    await expect(CreateDiscussionPage({ searchParams: emptySearchParams })).rejects.toThrow(
      'redirect:/login',
    )
  })

  it('renders post form when contribution is allowed', async () => {
    mockGetCurrentUser.mockResolvedValue(user)
    mockGetMyContributionStatus.mockResolvedValue(allowedStatus)
    const result = await CreateDiscussionPage({ searchParams: emptySearchParams })
    render(result)
    expect(screen.getByTestId('post-form')).toBeDefined()
    expect(screen.queryByTestId('contribution-gated-cta')).toBeNull()
  })

  it('passes eligible community options and initial community slug to the post form', async () => {
    mockGetCurrentUser.mockResolvedValue(user)
    mockGetMyContributionStatus.mockResolvedValue(allowedStatus)
    mockGetEligibleCommunityPostOptions.mockResolvedValue({
      communityOptions: [{ id: 'community-1', name: 'Rewards', slug: 'rewards' }],
      initialCommunitySlug: 'rewards',
    })
    const result = await CreateDiscussionPage({
      searchParams: Promise.resolve({ community: 'rewards' }),
    })
    render(result)

    expect(mockGetEligibleCommunityPostOptions).toHaveBeenCalledWith('discussion', 'rewards')
    expect(mockPostForm).toHaveBeenCalledWith(
      expect.objectContaining({
        postType: 'discussion',
        communityOptions: [{ id: 'community-1', name: 'Rewards', slug: 'rewards' }],
        initialCommunitySlug: 'rewards',
      }),
      undefined,
    )
  })

  it('renders CTA and hides form when account_too_new', async () => {
    mockGetCurrentUser.mockResolvedValue(user)
    mockGetMyContributionStatus.mockResolvedValue(gatedStatus)
    const result = await CreateDiscussionPage({ searchParams: emptySearchParams })
    render(result)
    expect(screen.getByTestId('contribution-gated-cta')).toBeDefined()
    expect(screen.queryByTestId('post-form')).toBeNull()
    expect(screen.getByText('start a discussion')).toBeDefined()
  })

  it('renders CTA and hides form when email_verification_required', async () => {
    mockGetCurrentUser.mockResolvedValue(user)
    mockGetMyContributionStatus.mockResolvedValue({
      contribution_status: { allowed: false, reason: 'email_verification_required' },
      admission: { allowed: true },
    })
    const result = await CreateDiscussionPage({ searchParams: emptySearchParams })
    render(result)
    expect(screen.getByTestId('contribution-gated-cta')).toBeDefined()
    expect(screen.queryByTestId('post-form')).toBeNull()
  })

  it('renders form when getMyContributionStatus fails', async () => {
    mockGetCurrentUser.mockResolvedValue(user)
    mockGetMyContributionStatus.mockRejectedValue(new Error('API error'))
    const result = await CreateDiscussionPage({ searchParams: emptySearchParams })
    render(result)
    expect(screen.getByTestId('post-form')).toBeDefined()
    expect(screen.queryByTestId('contribution-gated-cta')).toBeNull()
  })
})
