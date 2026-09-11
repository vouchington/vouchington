import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RefundableCharge } from '@/types/api-responses'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { seedMessages } from '@/lib/i18n/use-translations'
import enMessages from '@ts-shared/ui-messages/messages/en'
import esMessages from '@ts-shared/ui-messages/messages/es'
import { MembershipRefundForm } from '../membership-refund-form'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: vi.fn<VitestLooseMock>() }),
    }) as unknown as typeof import('next/navigation'),
)

const usdCharge: RefundableCharge = {
  charge_id: 'ch_usd',
  payment_intent_id: null,
  invoice_id: 'in_usd',
  amount: { amount: 2000, currency: 'usd' },
  amount_refunded: { amount: 0, currency: 'usd' },
  created_at: '2026-01-15T00:00:00.000Z',
  description: 'USD plan',
}

const jpyCharge: RefundableCharge = {
  ...usdCharge,
  charge_id: 'ch_jpy',
  invoice_id: 'in_jpy',
  amount: { amount: 2000, currency: 'jpy' },
  amount_refunded: { amount: 0, currency: 'jpy' },
  description: 'JPY plan',
}

describe('MembershipRefundForm locale copy', () => {
  it('clearly describes the default full-remaining-amount behavior in English', () => {
    seedMessages('en', enMessages)
    render(
      <UiLocaleProvider uiLocale='en'>
        <MembershipRefundForm
          actorUserId='admin-1'
          userId='user-1'
          charges={[usdCharge]}
          onReload={vi.fn<VitestLooseMock>()}
        />
      </UiLocaleProvider>,
    )

    expect(
      screen.getByLabelText('Amount (leave blank to refund the full remaining amount)'),
    ).toBeInTheDocument()
  })

  it('describes the remaining refundable amount and localizes currency-neutral examples', () => {
    seedMessages('es', esMessages)
    render(
      <UiLocaleProvider uiLocale='es'>
        <MembershipRefundForm
          actorUserId='admin-1'
          userId='user-1'
          charges={[usdCharge, jpyCharge]}
          onReload={vi.fn<VitestLooseMock>()}
        />
      </UiLocaleProvider>,
    )

    expect(
      screen.getByLabelText('Importe (dejar en blanco para reembolsar todo el importe restante)'),
    ).toHaveAttribute('placeholder', 'Por ejemplo, 5.00')
    expect(screen.queryByPlaceholderText(/For example/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByText(/JPY plan/))
    expect(
      screen.getByLabelText('Importe (dejar en blanco para reembolsar todo el importe restante)'),
    ).toHaveAttribute('placeholder', 'Por ejemplo, 500')
  })
})
