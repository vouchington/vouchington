import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { banEvasionReport } from '@/storybook/entities/admin-reports.fixtures'
import { ReportBanEvasionActions } from './report-ban-evasion-actions'

describe('ReportBanEvasionActions labels', () => {
  it('can transition from an ineligible report to ban-evasion actions', () => {
    const { rerender } = render(
      <ReportBanEvasionActions
        disabled={false}
        report={{ ...banEvasionReport, is_system_generated: false }}
      />,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    rerender(
      <ReportBanEvasionActions
        disabled={false}
        report={{ ...banEvasionReport, target_label: 'Suspected account' }}
      />,
    )
    expect(
      screen.getByRole('button', { name: /confirm ban evasion for suspected account/i }),
    ).toBeInTheDocument()
  })

  it('uses facts in action names without exposing the target ID', () => {
    render(
      <ReportBanEvasionActions
        disabled={false}
        report={{ ...banEvasionReport, target_label: 'Suspected account' }}
      />,
    )
    expect(
      screen.getByRole('button', { name: /confirm ban evasion for suspected account/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /dismiss flag.*suspected account/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText(banEvasionReport.entity_id)).not.toBeInTheDocument()
  })

  it('translates deleted-content sentinels in action names', () => {
    render(
      <ReportBanEvasionActions
        disabled={false}
        report={{ ...banEvasionReport, target_label: '[deleted content]' }}
      />,
    )
    expect(
      screen.getByRole('button', { name: /confirm ban evasion for deleted content/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText('[deleted content]')).not.toBeInTheDocument()
  })
})
