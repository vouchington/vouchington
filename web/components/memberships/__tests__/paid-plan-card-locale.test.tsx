import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { seedMessages } from '@/lib/i18n/use-translations'
import type { MembershipPlanSku } from '@/types/api-responses'
import esMessages from '@ts-shared/ui-messages/messages/es'
import { PaidPlanCard } from '../paid-plan-card'

const yearlySku: MembershipPlanSku = {
  id: 'plus-yearly',
  plan: 'plus',
  price: { amount: 10_000, currency: 'usd' },
  interval: 'yearly',
  stripe_price_id: 'price-plus-yearly',
}

describe('PaidPlanCard', () => {
  it('formats the price and monthly equivalent with the active UI locale', () => {
    seedMessages('es', esMessages)

    render(
      <UiLocaleProvider uiLocale='es'>
        <PaidPlanCard
          billingInterval='yearly'
          isCurrent={false}
          planSlug='plus'
          savingsPct={null}
          sku={yearlySku}
        />
      </UiLocaleProvider>,
    )

    expect(screen.getByText(/100,00 US\$/)).toBeInTheDocument()
    expect(screen.getByText(/8,333333 US\$\/mes facturado anualmente/)).toBeInTheDocument()
    expect(screen.queryByText(/\$100\.00/)).not.toBeInTheDocument()
  })
})
