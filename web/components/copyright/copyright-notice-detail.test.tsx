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
              event_type: 'notice_received',
              created_at: '2026-01-02T00:00:00.000Z',
            },
            {
              id: 'event-124',
              event_type: 'placement_withheld',
              created_at: '2026-01-03T00:00:00.000Z',
            },
          ],
        }}
        responseEligibility={null}
      />,
    )

    expect(screen.getByText('Case case-123')).toBeInTheDocument()
    expect(screen.getByText('Notice received', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Material withheld', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText(/notice_received/)).not.toBeInTheDocument()
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

  it('names an event type outside the case-facing set by its plain words', () => {
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
          timeline: [
            {
              id: 'event-125',
              event_type: 'guest_capability_issued',
              created_at: '2026-01-04T00:00:00.000Z',
            },
          ],
        }}
        responseEligibility={{ viewer_role: 'staff', respondable_target_ids: [] }}
      />,
    )

    expect(screen.getByText('guest capability issued', { exact: false })).toBeInTheDocument()
  })
  it('renders stored statements only when available', () => {
    const notice = {
      id: 'case-123',
      jurisdiction: 'us_dmca' as const,
      received_at: '2026-01-01T00:00:00.000Z',
      accepted_at: '2026-01-02T00:00:00.000Z',
      provisional_withholding_at: null,
      target_count: 0,
      claimant: null,
      targets: [],
      timeline: [],
    }
    const { rerender } = render(
      <CopyrightNoticeDetailView
        notice={notice}
        responseEligibility={null}
        statements={[]}
      />,
    )
    expect(
      screen.queryByRole('heading', { name: 'Statements of reasons and decisions' }),
    ).not.toBeInTheDocument()
    rerender(
      <CopyrightNoticeDetailView
        notice={notice}
        responseEligibility={null}
        statements={[
          {
            id: 'statement-123',
            delivery_kind: 'poster_review_notice',
            sent_at: null,
            text: 'Stored decision evidence.',
          },
        ]}
      />,
    )
    expect(
      screen.getByRole('heading', { name: 'Statements of reasons and decisions' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Stored decision evidence.')).toBeInTheDocument()
    expect(screen.getByText('Delivery pending')).toBeInTheDocument()
  })
})
