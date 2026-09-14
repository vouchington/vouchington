import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RefundableCharge } from '@/types/api-responses'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { seedMessages } from '@/lib/i18n/use-translations'
import { MembershipRefundChargeList } from '../membership-refund-charge-list'
import { esMessages } from '@ts-shared/ui-messages/locale-catalogs'

const partiallyRefundedCharge: RefundableCharge = {
  charge_id: 'ch_partial',
  payment_intent_id: null,
  invoice_id: 'in_partial',
  amount: { amount: 1000, currency: 'usd' },
  amount_refunded: { amount: 500, currency: 'usd' },
  created_at: '2026-01-10T12:00:00.000Z',
  description: null,
}

describe('MembershipRefundChargeList', () => {
  it('formats refundable charges with the active UI locale', () => {
    seedMessages('es', esMessages)

    render(
      <UiLocaleProvider uiLocale='es'>
        <MembershipRefundChargeList
          charges={[partiallyRefundedCharge]}
          selectedCharge={partiallyRefundedCharge}
          onSelect={vi.fn<(charge: RefundableCharge) => void>()}
          disabled={false}
        />
      </UiLocaleProvider>,
    )

    expect(screen.getByText(/10,00 US\$/)).toBeInTheDocument()
    expect(screen.getByText(/5,00 US\$ ya reembolsado/)).toBeInTheDocument()
    expect(screen.getByText(/10\/1\/2026/)).toBeInTheDocument()
    expect(screen.queryByText(/\$10\.00/)).not.toBeInTheDocument()
    expect(screen.queryByText(/1\/10\/2026/)).not.toBeInTheDocument()
  })
})
