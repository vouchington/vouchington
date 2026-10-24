import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReportIntegrityPenalty } from '@/types/report-integrity'

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

    render(
      <AnnualPenaltyReviews
        getDue={getDue}
        review={review}
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

    render(
      <AnnualPenaltyReviews
        getDue={getDue}
        review={review}
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
})
