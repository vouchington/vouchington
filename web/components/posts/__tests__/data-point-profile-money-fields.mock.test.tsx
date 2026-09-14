import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UiLocaleContext } from '@/lib/i18n/ui-locale-context'
import { seedMessages } from '@/lib/i18n/use-translations'
import { DataPointProfileFields } from '../data-point-profile-fields'
import type { FinancialProfile } from '@/types/my'
import { esMessages } from '@ts-shared/ui-messages/locale-catalogs'

vi.mock(
  import('@/components/ui/checkbox'),
  () =>
    ({
      Checkbox: () => null,
    }) as unknown as typeof import('@/components/ui/checkbox'),
)

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

const usdFinancialProfile: FinancialProfile = {
  user_id: 'user-1',
  currency: 'usd',
  credit_score_range: null,
  stated_income_range: {
    minimum: { amount: 5_000_000, currency: 'usd' },
    maximum: { amount: 7_500_000, currency: 'usd' },
  },
  total_credit_limit: { amount: 1_000_000, currency: 'usd' },
  years_of_credit_history: null,
  hard_inquiries_12m: null,
  cards_opened_24m: null,
  updated_at: '2026-07-25T00:00:00.000Z',
}

describe('DataPointProfileFields money inputs', () => {
  it('identifies income and total-credit-limit inputs with the selected currency', () => {
    seedMessages('es', esMessages)
    render(
      <UiLocaleContext.Provider value='es'>
        <DataPointProfileFields
          vertical='credit_card'
          data={{
            currency: 'jpy',
            stated_income_range: {
              minimum: { amount: 5_000_000, currency: 'jpy' },
              maximum: { amount: 7_500_000, currency: 'jpy' },
            },
            total_credit_limit_all_cards: { amount: 1_000_000, currency: 'jpy' },
          }}
          onUpdate={() => {}}
          saveToProfile={false}
          onSaveToProfileChange={() => {}}
        />
      </UiLocaleContext.Provider>,
    )

    expect(screen.getByLabelText('Ingresos mínimos (opcional)')).toHaveAccessibleDescription('JPY')
    expect(screen.getByLabelText('Ingresos máximos (opcional)')).toHaveAccessibleDescription('JPY')
    expect(
      screen.getByLabelText('Límite de Crédito Total (todas las tarjetas) (opcional)'),
    ).toHaveAccessibleDescription('JPY')
  })

  it('does not display income from a profile whose currency differs from the post', () => {
    seedMessages('es', esMessages)
    render(
      <UiLocaleContext.Provider value='es'>
        <DataPointProfileFields
          vertical='credit_card'
          data={{ currency: 'jpy' }}
          userFinancialProfile={usdFinancialProfile}
          onUpdate={() => {}}
          saveToProfile={false}
          onSaveToProfileChange={() => {}}
        />
      </UiLocaleContext.Provider>,
    )

    expect(screen.getByLabelText('Ingresos mínimos (opcional)')).toHaveValue('')
    expect(screen.getByLabelText('Ingresos máximos (opcional)')).toHaveValue('')
    expect(screen.getByLabelText('Ingresos mínimos (opcional)')).toHaveAccessibleDescription('JPY')
    expect(
      screen.getByLabelText('Límite de Crédito Total (todas las tarjetas) (opcional)'),
    ).toHaveValue('')
  })

  it('displays profile income when the profile and post currencies match', () => {
    seedMessages('es', esMessages)
    render(
      <UiLocaleContext.Provider value='es'>
        <DataPointProfileFields
          vertical='bank_account'
          data={{ currency: 'usd' }}
          userFinancialProfile={usdFinancialProfile}
          onUpdate={() => {}}
          saveToProfile={false}
          onSaveToProfileChange={() => {}}
        />
      </UiLocaleContext.Provider>,
    )

    expect(screen.getByLabelText('Ingresos mínimos (opcional)')).toHaveValue('50000')
    expect(screen.getByLabelText('Ingresos máximos (opcional)')).toHaveValue('75000')
  })
})
