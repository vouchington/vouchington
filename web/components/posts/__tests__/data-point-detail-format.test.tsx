import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { DataPointDetail } from '../data-point-detail'
import { formatMoneyRange } from '../data-point-detail-format'

describe('data point detail money formatting', () => {
  it('formats a single monetary value with the active UI locale', () => {
    render(
      <UiLocaleProvider uiLocale='es'>
        <DataPointDetail
          vertical='credit_card'
          structuredData={{
            result: 'approved',
            credit_limit: { amount: 3500, currency: 'usd' },
          }}
          labels={{ creditCard: 'Credit card', bankAccount: 'Bank account' }}
        />
      </UiLocaleProvider>,
    )

    expect(screen.getByText(/35,00.*US\$/)).toBeInTheDocument()
    expect(screen.queryByText('$35.00')).not.toBeInTheDocument()
  })

  it('formats bounded and open-ended monetary ranges', () => {
    expect(
      formatMoneyRange(
        {
          minimum: { amount: 3500, currency: 'usd' },
          maximum: { amount: 5000, currency: 'usd' },
        },
        'es',
      ),
    ).toBe('35,00 US$ to 50,00 US$')
    expect(
      formatMoneyRange(
        {
          minimum: { amount: 3500, currency: 'usd' },
          maximum: null,
        },
        'es',
      ),
    ).toBe('35,00 US$+')
  })
})
