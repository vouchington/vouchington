import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReportIntegrityPenalty } from '@/types/report-integrity'
import type { VoteIntegrityPenalty } from '@/types/vote-integrity'

vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => (key: string) => key,
}))

import { AnnualPenaltyReviews } from './annual-penalty-reviews'

const duePenalty: ReportIntegrityPenalty = {
  id: '018f6763-0a71-752d-b657-a06cf00dd401',
  user_id: '018f6763-0a71-752d-b657-a06cf00dd402',
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
      .fn<() => Promise<{ results: ReportIntegrityPenalty[]; has_more: boolean }>>()
      .mockResolvedValueOnce({ results: [duePenalty], has_more: false })
      .mockResolvedValueOnce({ results: [], has_more: false })
    const review = vi
      .fn<(id: string) => Promise<{ penalty: ReportIntegrityPenalty }>>()
      .mockResolvedValue({ penalty: duePenalty })
    const revoke = vi.fn<(id: string) => Promise<{ penalty: ReportIntegrityPenalty }>>()

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

    await waitFor(() => expect(review).toHaveBeenCalledWith(duePenalty.id))
    await screen.findByText('moderation.penaltyReviews.empty')
    expect(getDue).toHaveBeenCalledTimes(2)
  })

  it('checks the due queue after a lost confirmation response', async () => {
    const getDue = vi
      .fn<() => Promise<{ results: ReportIntegrityPenalty[]; has_more: boolean }>>()
      .mockResolvedValueOnce({ results: [duePenalty], has_more: false })
      .mockResolvedValueOnce({ results: [], has_more: false })
    const review = vi
      .fn<(id: string) => Promise<{ penalty: ReportIntegrityPenalty }>>()
      .mockRejectedValue(new Error('response lost'))
    const revoke = vi.fn<(id: string) => Promise<{ penalty: ReportIntegrityPenalty }>>()

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
    const ring: VoteIntegrityPenalty = {
      ...duePenalty,
      penalty_multiplier: 0.25,
      reason: 'voting_ring',
    }
    const referral: VoteIntegrityPenalty = {
      ...ring,
      id: '018f6763-0a71-752d-b657-a06cf00dd403',
      reason: 'referral_link_in_post',
    }
    const getDue = vi
      .fn<() => Promise<{ results: VoteIntegrityPenalty[]; has_more: boolean }>>()
      .mockResolvedValueOnce({ results: [ring, referral], has_more: false })
      .mockResolvedValueOnce({ results: [ring], has_more: false })
      .mockResolvedValueOnce({ results: [], has_more: false })
    const review = vi.fn<(id: string) => Promise<{ penalty: VoteIntegrityPenalty }>>()
    const revoke = vi
      .fn<(id: string) => Promise<{ penalty: VoteIntegrityPenalty }>>()
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
