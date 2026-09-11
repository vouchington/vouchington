import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ListResponse, UserReferralLinkWithDetails } from '@/types/api-responses'

const { mockGetAllMyReferralLinks, mockGetMembership } = vi.hoisted(() => ({
  mockGetAllMyReferralLinks: vi.fn<VitestLooseMock>(),
  mockGetMembership: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getAllMyReferralLinks: mockGetAllMyReferralLinks,
  getMembership: mockGetMembership,
}))
vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: async () => (key: string) => key,
}))
vi.mock(import('@/components/my/settings-page-header'), () => ({
  SettingsPageHeader: () => <div />,
}))
vi.mock(import('@/components/my/referral-links-manager'), () => ({
  ReferralLinksManager: ({
    initialLinks,
    hasPlusTier,
  }: {
    initialLinks: UserReferralLinkWithDetails[]
    hasPlusTier: boolean
  }) => (
    <div data-testid='referral-links-page-data'>
      {initialLinks.map(link => link.id).join(',')}
      {`|hasPlusTier:${hasPlusTier}`}
    </div>
  ),
}))

import MyReferralLinksPage from './page'

function makeLinksResponse(): ListResponse<UserReferralLinkWithDetails> {
  return {
    results: [
      {
        id: 'link-1',
        user_id: 'user-1',
        referral_program_id: 'rp-1',
        url_id: 'url-1',
        url: 'https://example.com/ref/abc',
        label: null,
        activated_at: '2024-01-01T00:00:00Z',
        deactivated_at: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        referral_program_name: 'Example Program',
        referral_program_slug: 'example-program',
        parent_link_id: null,
        unfurl_requested_at: null,
        unfurl_completed_at: null,
        unfurl_failed_at: null,
        unfurl_last_error: null,
      },
    ],
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  }
}

describe('MyReferralLinksPage', () => {
  it('renders an error message when the referral links fetch returns null', async () => {
    mockGetAllMyReferralLinks.mockResolvedValue(null)
    mockGetMembership.mockResolvedValue({ membership: null })

    render(await MyReferralLinksPage())

    expect(screen.getByText(/failedToLoadReferralLinksPlease/)).toBeDefined()
  })

  it('passes hasPlusTier=false to the manager for a free-tier owner', async () => {
    mockGetAllMyReferralLinks.mockResolvedValue(makeLinksResponse())
    mockGetMembership.mockResolvedValue({ membership: null })

    render(await MyReferralLinksPage())

    expect(screen.getByTestId('referral-links-page-data')).toHaveTextContent(
      'link-1|hasPlusTier:false',
    )
  })

  it('passes hasPlusTier=true to the manager for an active plus-tier owner', async () => {
    mockGetAllMyReferralLinks.mockResolvedValue(makeLinksResponse())
    mockGetMembership.mockResolvedValue({
      membership: { plan: 'plus', status: 'active' },
    })

    render(await MyReferralLinksPage())

    expect(screen.getByTestId('referral-links-page-data')).toHaveTextContent(
      'link-1|hasPlusTier:true',
    )
  })
})
