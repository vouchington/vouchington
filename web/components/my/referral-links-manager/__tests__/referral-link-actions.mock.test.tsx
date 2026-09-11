import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UserReferralLinkWithDetails } from '@/types/api-responses'
import { ReferralLinkActions } from '../referral-link-actions'

vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => (key: string) => key,
}))

const baseLink: UserReferralLinkWithDetails = {
  id: 'link-1',
  user_id: 'user-1',
  referral_program_id: 'rp-1',
  url_id: 'url-1',
  url: 'https://bank.com/ref/you',
  label: 'My link',
  activated_at: '2024-01-01T00:00:00Z',
  deactivated_at: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  referral_program_name: 'Bank',
  referral_program_slug: 'bank',
  parent_link_id: null,
  unfurl_requested_at: null,
  unfurl_completed_at: null,
  unfurl_failed_at: null,
  unfurl_last_error: null,
}

function renderActions(overrides: {
  link?: Partial<UserReferralLinkWithDetails>
  hasPlusTier?: boolean
  onUnfurl?: (link: UserReferralLinkWithDetails) => void
}) {
  const link = { ...baseLink, ...overrides.link }
  const onUnfurl = overrides.onUnfurl ?? vi.fn<VitestLooseMock>()
  render(
    <ReferralLinkActions
      confirmingDeleteId={null}
      hasPlusTier={overrides.hasPlusTier ?? true}
      link={link}
      loadingIds={new Set()}
      onDelete={vi.fn<VitestLooseMock>()}
      onToggleActive={vi.fn<VitestLooseMock>()}
      onUnfurl={onUnfurl}
      setConfirmingDeleteId={vi.fn<VitestLooseMock>()}
      setEditLabel={vi.fn<VitestLooseMock>()}
      setEditingId={vi.fn<VitestLooseMock>()}
    />,
  )
  return { link, onUnfurl }
}

describe('ReferralLinkActions', () => {
  it('hides the Unfurl button for a non-Amex-all-cards referral program', () => {
    renderActions({ link: { referral_program_slug: 'bank' } })

    expect(
      screen.queryByRole('button', {
        name: 'extracted.referralLinksManager.referralLinkActions.unfurl_767a3048',
      }),
    ).not.toBeInTheDocument()
  })

  it('shows an enabled Unfurl button for a Plus-tier owner of an Amex all-cards link', () => {
    const { link, onUnfurl } = renderActions({
      link: { referral_program_slug: 'amex-referral-program' },
      hasPlusTier: true,
    })

    const button = screen.getByRole('button', {
      name: 'extracted.referralLinksManager.referralLinkActions.unfurl_767a3048',
    })
    expect(button).toBeEnabled()

    fireEvent.click(button)
    expect(onUnfurl).toHaveBeenCalledWith(link)
  })

  it('disables the Unfurl button for a free-tier owner of an Amex all-cards link', () => {
    renderActions({
      link: { referral_program_slug: 'amex-referral-program' },
      hasPlusTier: false,
    })

    expect(
      screen.getByRole('button', {
        name: 'extracted.referralLinksManager.referralLinkActions.unfurl_767a3048',
      }),
    ).toBeDisabled()
  })
})
