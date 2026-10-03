import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CopyrightNoticeStatements } from './copyright-notice-statements'

describe('statement delivery outcomes', () => {
  it.each([
    ['pending', null, 'Delivery pending'],
    ['claimed', null, 'Delivery pending'],
    ['failed', null, 'Delivery failed'],
    ['bounced', '2026-10-01T12:00:00Z', 'Delivery could not be completed'],
  ] as const)('displays %s accurately while retaining the legal text', (state, sentAt, label) => {
    render(
      <CopyrightNoticeStatements
        statements={[
          {
            id: 'statement',
            delivery_kind: 'claimant_decision_notice',
            state,
            sent_at: sentAt,
            text: 'Immutable legal statement.',
          },
        ]}
      />,
    )
    expect(screen.getByText(label, { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Immutable legal statement.')).toBeInTheDocument()
    expect(Boolean(screen.queryByText('Delivery pending'))).toBe(
      state === 'pending' || state === 'claimed',
    )
  })
})
