import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AdminReviewQueuePost } from '@/types/admin-review-queue'
import { ModerationSummary } from './review-queue-helpers'

const evidenceSummary = { flagged_category_count: 0, signal_count: 0 }

describe('ModerationSummary', () => {
  it.each<[AdminReviewQueuePost['moderation_summary']['disposition'], string]>([
    ['pass', 'clear'],
    ['review', 'In review'],
    ['reject', 'Rejected'],
    ['incomplete', 'pending'],
    [null, 'pending'],
  ])('renders the %s disposition with a localized label', (disposition, label) => {
    render(
      <ModerationSummary
        summary={{ disposition, reason_codes: [], evidence_summary: evidenceSummary }}
      />,
    )

    expect(screen.getByText(label)).toBeDefined()
  })

  it.each([
    ['provider_pass', 'clear'],
    ['provider_passed', 'clear'],
    ['staff_approved', 'Approved'],
    ['staff_rejected', 'Rejected'],
    ['staff_reviewed', 'In review'],
    ['automation_unavailable', 'pending'],
    ['no_content_to_moderate', 'pending'],
    ['provider_flagged', 'flagged'],
    ['spam_signal', 'flagged'],
    ['sexual_minors', 'flagged'],
    ['future_reason', 'pending'],
  ])('renders the %s reason with a safe localized label', (reasonCode, label) => {
    const { container } = render(
      <ModerationSummary
        summary={{
          disposition: 'review',
          reason_codes: [reasonCode],
          evidence_summary: evidenceSummary,
        }}
      />,
    )

    expect(container.querySelector('.text-muted-foreground')).toHaveTextContent(label)
    expect(screen.queryByText(reasonCode)).toBeNull()
  })
})
