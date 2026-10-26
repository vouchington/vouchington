import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReportIntegrityPenaltyReviewDue } from '@/types/report-integrity'
import type { VoteIntegrityPenaltyReviewDue } from '@/types/vote-integrity'

vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => (key: string) => key,
}))

import { AnnualPenaltyReviews } from './annual-penalty-reviews'

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

describe('AnnualPenaltyReviews', () => {
  it('shows a due penalty and removes it after a confirmed review', async () => {
    const getDue = vi
      .fn<() => Promise<{ results: ReportIntegrityPenaltyReviewDue[]; has_more: boolean }>>()
      .mockResolvedValueOnce({ results: [duePenalty], has_more: false })
      .mockResolvedValueOnce({ results: [], has_more: false })
    const review = vi
      .fn<(id: string) => Promise<{ penalty: ReportIntegrityPenaltyReviewDue }>>()
      .mockResolvedValue({ penalty: duePenalty })
    const revoke = vi.fn<(id: string) => Promise<{ penalty: ReportIntegrityPenaltyReviewDue }>>()

    render(
      <AnnualPenaltyReviews
        getDue={getDue}
        review={review}
        revoke={revoke}
      />,
    )
    const userLink = await screen.findByRole('link', { name: 'penalty-recipient' })
    expect(userLink).toHaveAttribute('href', '/user/penalty-recipient')
    expect(screen.queryByText(duePenalty.user_id)).not.toBeInTheDocument()
    fireEvent.click(
      await screen.findByRole('button', { name: 'moderation.penaltyReviews.confirm' }),
    )

    await waitFor(() => expect(review).toHaveBeenCalledWith(duePenalty.id))
    await screen.findByText('moderation.penaltyReviews.empty')
    expect(getDue).toHaveBeenCalledTimes(2)
  })

  it('keeps an unavailable profile unlinked without showing its UUID', async () => {
    const getDue = vi.fn<
      () => Promise<{ results: ReportIntegrityPenaltyReviewDue[]; has_more: boolean }>
    >(async () => ({
      results: [{ ...duePenalty, user_username: null }],
      has_more: false,
    }))
    render(
      <AnnualPenaltyReviews
        getDue={getDue}
        review={vi.fn<(id: string) => Promise<unknown>>()}
        revoke={vi.fn<(id: string) => Promise<unknown>>()}
      />,
    )
    await screen.findByText('extracted.communities.communityMemberRow.unknownUser_0bca6947')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByText(duePenalty.user_id)).not.toBeInTheDocument()
  })

  it('checks the due queue after a lost confirmation response', async () => {
    const getDue = vi
      .fn<() => Promise<{ results: ReportIntegrityPenaltyReviewDue[]; has_more: boolean }>>()
      .mockResolvedValueOnce({ results: [duePenalty], has_more: false })
      .mockResolvedValueOnce({ results: [], has_more: false })
    const review = vi
      .fn<(id: string) => Promise<{ penalty: ReportIntegrityPenaltyReviewDue }>>()
      .mockRejectedValue(new Error('response lost'))
    const revoke = vi.fn<(id: string) => Promise<{ penalty: ReportIntegrityPenaltyReviewDue }>>()

    render(
      <AnnualPenaltyReviews
        getDue={getDue}
        review={review}
        revoke={revoke}
      />,
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'moderation.penaltyReviews.confirm' }),
    )

    await screen.findByText('moderation.penaltyReviews.empty')
    expect(review).toHaveBeenCalledTimes(1)
    expect(
      screen.queryByText('extracted.flags.integrityPenalties.resultUncertain_e24ec07b'),
    ).not.toBeInTheDocument()
  })

  it('lets staff revoke due vote penalties of either reason after confirmation', async () => {
    const ring: VoteIntegrityPenaltyReviewDue = {
      ...duePenalty,
      penalty_multiplier: 0.25,
      reason: 'voting_ring',
    }
    const referral: VoteIntegrityPenaltyReviewDue = {
      ...ring,
      id: '018f6763-0a71-752d-b657-a06cf00dd403',
      reason: 'referral_link_in_post',
    }
    const getDue = vi
      .fn<() => Promise<{ results: VoteIntegrityPenaltyReviewDue[]; has_more: boolean }>>()
      .mockResolvedValueOnce({ results: [ring, referral], has_more: false })
      .mockResolvedValueOnce({ results: [ring], has_more: false })
      .mockResolvedValueOnce({ results: [], has_more: false })
    const review = vi.fn<(id: string) => Promise<{ penalty: VoteIntegrityPenaltyReviewDue }>>()
    const revoke = vi
      .fn<(id: string) => Promise<{ penalty: VoteIntegrityPenaltyReviewDue }>>()
      .mockResolvedValueOnce({ penalty: { ...referral, revoked_at: '2026-01-02T00:00:00Z' } })
      .mockResolvedValueOnce({ penalty: { ...ring, revoked_at: '2026-01-02T00:00:00Z' } })

    render(
      <AnnualPenaltyReviews
        getDue={getDue}
        review={review}
        revoke={revoke}
      />,
    )

    const referralRow = (await screen.findByText('referral_link_in_post')).closest('li')!
    fireEvent.click(
      within(referralRow).getByRole('button', {
        name: 'extracted.flags.integrityPenalties.revoke_ec2f3e37',
      }),
    )
    expect(revoke).not.toHaveBeenCalled()
    fireEvent.click(
      within(referralRow).getByRole('button', {
        name: 'extracted.flags.integrityPenalties.confirmRevoke_3ec93b2c',
      }),
    )
    await waitFor(() => expect(revoke).toHaveBeenCalledWith(referral.id))
    await waitFor(() => expect(screen.queryByText('referral_link_in_post')).not.toBeInTheDocument())

    const ringRow = screen.getByText('voting_ring').closest('li')!
    fireEvent.click(
      within(ringRow).getByRole('button', {
        name: 'extracted.flags.integrityPenalties.revoke_ec2f3e37',
      }),
    )
    fireEvent.click(
      within(ringRow).getByRole('button', {
        name: 'extracted.flags.integrityPenalties.confirmRevoke_3ec93b2c',
      }),
    )
    await waitFor(() => expect(revoke).toHaveBeenCalledWith(ring.id))
    await screen.findByText('moderation.penaltyReviews.empty')
    expect(review).not.toHaveBeenCalled()
    expect(getDue).toHaveBeenCalledTimes(3)
  })
})
