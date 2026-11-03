import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IntegrityFlagEvidence } from './integrity-flag-evidence'

describe('IntegrityFlagEvidence', () => {
  it('shows mass-report aggregates without the reporter ID set', () => {
    const { container } = render(
      <IntegrityFlagEvidence
        domain='report'
        flagType='mass_report_suspected'
        details={{
          reporter_user_ids: ['019f7000-0000-7000-8000-000000000101'],
          reporter_count: 12,
          new_account_reporter_count: 9,
          threshold: 10,
          window_minutes: 60,
          new_account_age_days: 7,
        }}
      />,
    )
    expect(container).toHaveTextContent('New account reporters: 9')
    expect(container).toHaveTextContent('Alert threshold: 10')
    expect(container).toHaveTextContent('Window (minutes): 60')
    expect(container).toHaveTextContent('New account age (days): 7')
    expect(container).not.toHaveTextContent('019f7000-0000-7000-8000-000000000101')
    expect(container).not.toHaveTextContent('reporter_user_ids')
  })

  it('shows velocity evidence as counts and time bounds', () => {
    const { container } = render(
      <IntegrityFlagEvidence
        domain='vote'
        flagType='velocity_spike'
        details={{
          young_account_vote_count: 18,
          threshold: 10,
          window_minutes: 30,
          young_account_age_days: 14,
        }}
      />,
    )
    expect(container).toHaveTextContent('Votes from new accounts: 18')
    expect(container).toHaveTextContent('Alert threshold: 10')
    expect(container).toHaveTextContent('Window (minutes): 30')
    expect(container).toHaveTextContent('New account age (days): 14')
  })

  it('bounds correlated IP evidence and ignores unrelated details', () => {
    const ips = Array.from({ length: 7 }, (_, index) => ({
      ip_address: `192.0.2.${index + 1}`,
      distinct_user_count: index + 3,
    }))
    const { container } = render(
      <IntegrityFlagEvidence
        domain='vote'
        flagType='ip_correlation'
        details={{ correlated_ips: ips, threshold: 3, window_minutes: 15, user_id: 'hidden-id' }}
      />,
    )
    expect(screen.getByText(/192\.0\.2\.1/)).toBeInTheDocument()
    expect(screen.getByText(/192\.0\.2\.5/)).toBeInTheDocument()
    expect(container).toHaveTextContent('2 more IP addresses')
    expect(container).not.toHaveTextContent('192.0.2.6')
    expect(container).not.toHaveTextContent('hidden-id')
  })
})
