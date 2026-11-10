import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListResponse, UserReferralLinkSummary } from '@/types/api-responses'

const { mockGetUserProfile, mockGetUserReferralLinksList, mockNotFound } = vi.hoisted(() => ({
  mockGetUserProfile: vi.fn<VitestLooseMock>(),
  mockGetUserReferralLinksList: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock(
  import('next/navigation'),
  () => ({ notFound: mockNotFound }) as unknown as typeof import('next/navigation'),
)
vi.mock(
  import('@/lib/api/server/users'),
  () =>
    ({
      getUserProfile: mockGetUserProfile,
    }) as unknown as typeof import('@/lib/api/server/users'),
)
vi.mock(
  import('@/lib/api/server/referral-links'),
  () =>
    ({
      getUserReferralLinksList: mockGetUserReferralLinksList,
    }) as unknown as typeof import('@/lib/api/server/referral-links'),
)
vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: async () => (key: string) => key,
}))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(import('@/components/users/paginated-user-referral-link-list'), () => ({
  PaginatedUserReferralLinkList: ({
    initialData,
    userId,
    emptyTitle,
  }: {
    initialData: ListResponse<UserReferralLinkSummary>
    userId: string
    emptyTitle: string
  }) => (
    <div data-testid='user-referral-links-page'>
      <span>{userId}</span>
      <span>{emptyTitle}</span>
      {initialData.results.map(link => (
        <span key={link.id}>{link.referral_program_name}</span>
      ))}
    </div>
  ),
}))

import UserReferralLinksRoute from './page'

const links: ListResponse<UserReferralLinkSummary> = {
  results: [
    {
      id: 'link-1',
      user_id: 'user-alex',
      referral_program_id: 'program-1',
      referral_program_name: 'Chase Sapphire',
      referral_program_slug: 'chase-sapphire',
      url: 'https://example.com/ref/chase',
    },
  ],
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}

describe('UserReferralLinksRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNotFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })
  })

  it('calls notFound when the profile is missing', async () => {
    mockGetUserProfile.mockResolvedValue(null)

    await expect(
      UserReferralLinksRoute({ params: Promise.resolve({ idOrUsername: 'missing' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockGetUserReferralLinksList).not.toHaveBeenCalled()
  })

  it('calls notFound when the referral list is missing', async () => {
    mockGetUserProfile.mockResolvedValue({ user: { id: 'user-alex' } })
    mockGetUserReferralLinksList.mockResolvedValue(null)

    await expect(
      UserReferralLinksRoute({ params: Promise.resolve({ idOrUsername: 'alex' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders the public summary list for the profile user', async () => {
    mockGetUserProfile.mockResolvedValue({ user: { id: 'user-alex' } })
    mockGetUserReferralLinksList.mockResolvedValue(links)

    render(await UserReferralLinksRoute({ params: Promise.resolve({ idOrUsername: 'alex' }) }))

    expect(mockGetUserReferralLinksList).toHaveBeenCalledWith('user-alex')
    expect(screen.getByTestId('user-referral-links-page')).toBeDefined()
    expect(screen.getByText('user-alex')).toBeDefined()
    expect(screen.getByText('Chase Sapphire')).toBeDefined()
    expect(screen.getByText(/noReferralLinksFound/)).toBeDefined()
  })
})
