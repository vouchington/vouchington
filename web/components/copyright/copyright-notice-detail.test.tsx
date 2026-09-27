import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CopyrightNoticeDetailView } from './copyright-notice-detail'

describe('CopyrightNoticeDetailView', () => {
  it('renders the public projection without claimant, evidence, or agent fields', () => {
    render(
      <CopyrightNoticeDetailView
        notice={{
          id: 'case-123',
          jurisdiction: 'us_dmca',
          received_at: '2026-01-01T00:00:00.000Z',
          accepted_at: '2026-01-02T00:00:00.000Z',
          provisional_withholding_at: null,
          target_count: 1,
          claimant: { user_id: 'claimant-123', display_name: 'Current claimant' },
          targets: [
            {
              id: 'target-123',
              hosted_use_url: 'https://voucha.ai/posts/123',
              restriction_status: 'active',
            },
          ],
          timeline: [
            {
              id: 'event-123',
              event_type: 'notice_accepted',
              created_at: '2026-01-02T00:00:00.000Z',
            },
          ],
        }}
        responseEligibility={null}
      />,
    )

    expect(screen.getByText('Case case-123')).toBeInTheDocument()
    expect(screen.getByText('notice accepted', { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Current claimant' })).toHaveAttribute(
      'href',
      '/user/claimant-123',
    )
    expect(screen.queryByText(/claimant@example/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/agent recommendation/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Appeal' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Counter-notice' })).not.toBeInTheDocument()
  })

  it('renders response links only for an affected poster with respondable targets', () => {
    render(
      <CopyrightNoticeDetailView
        notice={{
          id: 'case-123',
          jurisdiction: 'us_dmca',
          received_at: '2026-01-01T00:00:00.000Z',
          accepted_at: '2026-01-02T00:00:00.000Z',
          provisional_withholding_at: null,
          target_count: 1,
          claimant: null,
          targets: [],
          timeline: [],
        }}
        responseEligibility={{ viewer_role: 'poster', respondable_target_ids: ['target-123'] }}
      />,
    )

    expect(screen.getByRole('link', { name: 'Appeal' })).toHaveAttribute(
      'href',
      '/copyright/notices/case-123/appeal',
    )
    expect(screen.getByRole('link', { name: 'Counter-notice' })).toHaveAttribute(
      'href',
      '/copyright/notices/case-123/counter-notice',
    )
    expect(screen.queryByText('Claimant:')).not.toBeInTheDocument()
  })
})
