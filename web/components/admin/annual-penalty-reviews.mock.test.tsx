import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReportIntegrityPenaltyReviewDue } from '@/types/report-integrity'
import type { VoteIntegrityPenaltyReviewDue } from '@/types/vote-integrity'

vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => (key: string) => key,
}))

import { AnnualPenaltyReviews, type AnnualPenaltyReviewsProps } from './annual-penalty-reviews'

const duePenalty: ReportIntegrityPenaltyReviewDue = {
  id: '018f6763-0a71-752d-b657-a06cf00dd401',
  user_id: '018f6763-0a71-752d-b657-a06cf00dd402',
  user_username: 'penalty-recipient',
  reason: 'mass_report_campaign',
  source_flag_id: null,
  created_by_id: null,
  revoked_at: null,
  revoked_by_id: null,
  reviewed_at: null,
  reviewed_by_id: null,
  review_due_at: '2026-01-01T00:00:00Z',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
}
const terminalInfo = { has_next_page: false, start_cursor: null, end_cursor: null }

describe('AnnualPenaltyReviews', () => {
  it('renders the supplied server page without a mount request and removes a confirmed review', async () => {
    const getDue = vi
      .fn<AnnualPenaltyReviewsProps<ReportIntegrityPenaltyReviewDue>['getDue']>()
      .mockResolvedValue({ results: [], page_info: terminalInfo })
    const review = vi
      .fn<(id: string) => Promise<unknown>>()
      .mockResolvedValue({ penalty: duePenalty })
    const reconcile = vi.fn<(id: string) => Promise<boolean>>().mockResolvedValue(true)
    render(
      <AnnualPenaltyReviews
        initialDuePage={{ results: [duePenalty], page_info: terminalInfo }}
        getDue={getDue}
        review={review}
        revoke={review}
        reconcile={reconcile}
      />,
    )
    expect(screen.getByRole('link', { name: 'penalty-recipient' })).toHaveAttribute(
      'href',
      '/user/penalty-recipient',
    )
    expect(screen.queryByText(duePenalty.user_id)).not.toBeInTheDocument()
    expect(getDue).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'moderation.penaltyReviews.confirm' }))
    await screen.findByText('moderation.penaltyReviews.empty')
    expect(review).toHaveBeenCalledWith(duePenalty.id)
    expect(reconcile).toHaveBeenCalledWith(duePenalty.id)
    expect(getDue).toHaveBeenCalledOnce()
  })

  it('keeps an absent public profile unlinked without rendering its UUID', () => {
    const getDue = vi.fn<AnnualPenaltyReviewsProps<ReportIntegrityPenaltyReviewDue>['getDue']>()
    const action = vi.fn<(id: string) => Promise<unknown>>()
    const reconcile = vi.fn<(id: string) => Promise<boolean>>().mockResolvedValue(true)
    render(
      <AnnualPenaltyReviews
        initialDuePage={{
          results: [{ ...duePenalty, user_username: null }],
          page_info: terminalInfo,
        }}
        getDue={getDue}
        review={action}
        revoke={action}
        reconcile={reconcile}
      />,
    )
    expect(
      screen.getByText('extracted.communities.communityMemberRow.unknownUser_0bca6947'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByText(duePenalty.user_id)).not.toBeInTheDocument()
    expect(getDue).not.toHaveBeenCalled()
  })

  it('reconciles a revoke whose response was lost after commit', async () => {
    const getDue = vi
      .fn<AnnualPenaltyReviewsProps<ReportIntegrityPenaltyReviewDue>['getDue']>()
      .mockResolvedValue({ results: [], page_info: terminalInfo })
    const revoke = vi
      .fn<(id: string) => Promise<unknown>>()
      .mockRejectedValue(new Error('response lost'))
    const reconcile = vi.fn<(id: string) => Promise<boolean>>().mockResolvedValue(true)
    render(
      <AnnualPenaltyReviews
        initialDuePage={{ results: [duePenalty], page_info: terminalInfo }}
        getDue={getDue}
        review={revoke}
        revoke={revoke}
        reconcile={reconcile}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'extracted.flags.integrityPenalties.revoke_ec2f3e37' }),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'extracted.flags.integrityPenalties.confirmRevoke_3ec93b2c',
      }),
    )
    await screen.findByText('moderation.penaltyReviews.empty')
    expect(revoke).toHaveBeenCalledOnce()
    expect(reconcile).toHaveBeenCalledWith(duePenalty.id)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('can revoke both flag and non-flag vote penalties through the independent due queue', async () => {
    const ring: VoteIntegrityPenaltyReviewDue = {
      ...duePenalty,
      reason: 'voting_ring',
      penalty_multiplier: 0.2,
    }
    const referral = {
      ...ring,
      id: '018f6763-0a71-752d-b657-a06cf00dd499',
      reason: 'referral_link_in_post',
    }
    const getDue = vi
      .fn<AnnualPenaltyReviewsProps<VoteIntegrityPenaltyReviewDue>['getDue']>()
      .mockResolvedValueOnce({ results: [ring], page_info: terminalInfo })
      .mockResolvedValueOnce({ results: [], page_info: terminalInfo })
    const revoke = vi.fn<(id: string) => Promise<unknown>>().mockResolvedValue({})
    const reconcile = vi.fn<(id: string) => Promise<boolean>>().mockResolvedValue(true)
    render(
      <AnnualPenaltyReviews
        initialDuePage={{ results: [ring, referral], page_info: terminalInfo }}
        getDue={getDue}
        review={revoke}
        revoke={revoke}
        reconcile={reconcile}
      />,
    )
    for (const penalty of [referral, ring]) {
      const row = screen.getByText(penalty.reason).closest('li')!
      fireEvent.click(
        within(row).getByRole('button', {
          name: 'extracted.flags.integrityPenalties.revoke_ec2f3e37',
        }),
      )
      fireEvent.click(
        within(row).getByRole('button', {
          name: 'extracted.flags.integrityPenalties.confirmRevoke_3ec93b2c',
        }),
      )
      await waitFor(() => expect(screen.queryByText(penalty.reason)).not.toBeInTheDocument())
    }
    expect(revoke).toHaveBeenNthCalledWith(1, referral.id)
    expect(revoke).toHaveBeenNthCalledWith(2, ring.id)
  })

  it('loads a later page without a decision and preserves opened pages after review', async () => {
    const later = {
      ...duePenalty,
      id: '018f6763-0a71-752d-b657-a06cf00dd499',
      user_username: 'later-recipient',
    }
    const first = {
      results: [duePenalty],
      page_info: { has_next_page: true, start_cursor: 'first', end_cursor: 'next' },
    }
    const last = { results: [later], page_info: terminalInfo }
    const getDue = vi
      .fn<AnnualPenaltyReviewsProps<ReportIntegrityPenaltyReviewDue>['getDue']>()
      .mockResolvedValueOnce(last)
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce({ results: [], page_info: terminalInfo })
    const action = vi.fn<(id: string) => Promise<unknown>>().mockResolvedValue({})
    const reconcile = vi.fn<(id: string) => Promise<boolean>>().mockResolvedValue(true)
    render(
      <AnnualPenaltyReviews
        initialDuePage={first}
        getDue={getDue}
        review={action}
        revoke={action}
        reconcile={reconcile}
      />,
    )
    expect(getDue).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'extracted.communities.communityAgentPromptHistory.loadMore_ac8991ef',
      }),
    )
    await screen.findByText('later-recipient')
    expect(getDue).toHaveBeenNthCalledWith(1, { after: 'next' })
    const row = screen.getByText('later-recipient').closest('li')!
    fireEvent.click(within(row).getByRole('button', { name: 'moderation.penaltyReviews.confirm' }))
    await waitFor(() => expect(screen.queryByText('later-recipient')).not.toBeInTheDocument())
    expect(screen.getByText('penalty-recipient')).toBeInTheDocument()
    expect(getDue).toHaveBeenNthCalledWith(3, { after: 'next' })
  })
  it('replaces accumulated rows on a same-active server refresh without fetching on prop changes', async () => {
    const later = {
      ...duePenalty,
      id: '018f6763-0a71-752d-b657-a06cf00dd498',
      user_username: 'old-page-two',
    }
    const updated = { ...duePenalty, user_username: 'fresh-server-page' }
    const first = {
      results: [duePenalty],
      page_info: { has_next_page: true, start_cursor: 'first', end_cursor: 'old-next' },
    }
    const nextServerPage = {
      results: [updated],
      page_info: { has_next_page: true, start_cursor: 'fresh', end_cursor: 'fresh-next' },
    }
    const getDue = vi
      .fn<AnnualPenaltyReviewsProps<ReportIntegrityPenaltyReviewDue>['getDue']>()
      .mockResolvedValueOnce({ results: [later], page_info: terminalInfo })
      .mockResolvedValueOnce(nextServerPage)
    const action = vi.fn<(id: string) => Promise<unknown>>()
    const reconcile = vi.fn<(id: string) => Promise<boolean>>().mockResolvedValue(true)
    const view = render(
      <AnnualPenaltyReviews
        initialDuePage={first}
        getDue={getDue}
        review={action}
        revoke={action}
        reconcile={reconcile}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'extracted.communities.communityAgentPromptHistory.loadMore_ac8991ef',
      }),
    )
    await screen.findByText('old-page-two')
    view.rerender(
      <AnnualPenaltyReviews
        initialDuePage={nextServerPage}
        getDue={getDue}
        review={action}
        revoke={action}
        reconcile={reconcile}
      />,
    )
    expect(screen.getByText('fresh-server-page')).toBeInTheDocument()
    expect(screen.queryByText('penalty-recipient')).not.toBeInTheDocument()
    expect(screen.queryByText('old-page-two')).not.toBeInTheDocument()
    expect(getDue).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'moderation.penaltyReviews.refresh' }))
    await waitFor(() => expect(getDue).toHaveBeenCalledTimes(2))
    expect(getDue).toHaveBeenLastCalledWith(undefined)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
