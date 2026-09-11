import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UiLocaleContext } from '@/lib/i18n/ui-locale-context'
import { seedMessages } from '@/lib/i18n/use-translations'
import enMessages from '@ts-shared/ui-messages/messages/en'
import esMessages from '@ts-shared/ui-messages/messages/es'
import frMessages from '@ts-shared/ui-messages/messages/fr'
import ptMessages from '@ts-shared/ui-messages/messages/pt'
import { CurrencySelect } from '../currency-select'

vi.mock(import('@/lib/api/client/currencies'), () => ({
  fetchCurrencies: vi.fn<VitestLooseMock>().mockResolvedValue({ results: [] }),
}))

describe('CurrencySelect localized labels', () => {
  it.each([
    ['es', esMessages, 'Moneda'],
    ['fr', frMessages, 'Devise'],
    ['pt', ptMessages, 'Moeda'],
  ] as const)(
    'uses the active %s locale and preserves the trigger id',
    (locale, messages, label) => {
      seedMessages(locale, messages)
      render(
        <UiLocaleContext.Provider value={locale}>
          <CurrencySelect
            id={`currency-${locale}`}
            value='eur'
            onValueChange={() => {}}
          />
        </UiLocaleContext.Provider>,
      )

      expect(screen.getByLabelText(label)).toHaveAttribute('id', `currency-${locale}`)
    },
  )

  it('preserves a caller-supplied label', () => {
    seedMessages('en', enMessages)
    render(
      <CurrencySelect
        id='custom-currency'
        value='usd'
        onValueChange={() => {}}
        label='Settlement currency'
      />,
    )

    expect(screen.getByLabelText('Settlement currency')).toHaveAttribute('id', 'custom-currency')
  })
})
