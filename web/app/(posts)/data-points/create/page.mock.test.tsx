import type { ReactNode } from 'react'
import { beforeEach, describe, vi } from 'vitest'

import { registerCreatePostPageCases } from '@/test-helpers/app/create-post-page-cases'

const {
  mockGetCurrentUser,
  mockGetMyContributionStatus,
  mockGetMyFinancialProfile,
  mockGetTopic,
  mockRedirect,
  mockGetEligibleCommunityPostOptions,
  mockPostForm,
  mockHeaders,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetMyContributionStatus: vi.fn<VitestLooseMock>(),
  mockGetMyFinancialProfile: vi.fn<VitestLooseMock>(),
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
  getMyFinancialProfile: mockGetMyFinancialProfile,
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

import CreateDataPointPage from './page'

describe('CreateDataPointPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetMyFinancialProfile.mockResolvedValue({ financial_profile: null })
    mockGetTopic.mockResolvedValue(null)
    mockGetEligibleCommunityPostOptions.mockResolvedValue({
      communityOptions: [],
      initialCommunitySlug: undefined,
    })
  })

  registerCreatePostPageCases({
    Page: CreateDataPointPage,
    postType: 'data_point',
    actionNoun: 'share a data point',
    community: { id: 'community-1', name: 'Data Points', slug: 'data-points' },
    mockGetCurrentUser,
    mockGetMyContributionStatus,
    mockGetEligibleCommunityPostOptions,
    mockPostForm,
  })
})
