import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import {
  createPostPageEmptySearchParams,
  createPostPageUser,
  registerCreatePostPageCases,
} from '@/test-helpers/app/create-post-page-cases'

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

describe('CreateReviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTopic.mockResolvedValue(null)
    mockGetEligibleCommunityPostOptions.mockResolvedValue({
      communityOptions: [],
      initialCommunitySlug: undefined,
    })
  })

  registerCreatePostPageCases({
    Page: CreateReviewPage,
    postType: 'review',
    actionNoun: 'write a review',
    community: { id: 'community-1', name: 'Reviews', slug: 'reviews' },
    mockGetCurrentUser,
    mockGetMyContributionStatus,
    mockGetEligibleCommunityPostOptions,
    mockPostForm,
  })

  it('renders CTA and hides form when action limit is reached', async () => {
    mockGetCurrentUser.mockResolvedValue(createPostPageUser)
    mockGetMyContributionStatus.mockResolvedValue({
      contribution_status: { allowed: true },
      admission: {
        allowed: false,
        reason: 'type_limit',
        retry_after_seconds: 60,
      },
    })
    const result = await CreateReviewPage({ searchParams: createPostPageEmptySearchParams })
    render(result)
    expect(screen.getByTestId('contribution-gated-cta')).toBeDefined()
    expect(screen.queryByTestId('post-form')).toBeNull()
  })
})
