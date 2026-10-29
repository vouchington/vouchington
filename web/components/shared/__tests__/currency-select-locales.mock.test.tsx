import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/lib/i18n/ui-locale-context'
import { mergeMessages } from '@/lib/i18n/use-translations'
import { CurrencySelect } from '../currency-select'
import {
  enMessages,
  esMessages,
  frMessages,
  ptMessages,
} from '@ts-shared/ui-messages/locale-catalogs'

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
      mergeMessages(locale, messages)
      render(
        <LocaleProvider locale={locale}>
          <CurrencySelect
            id={`currency-${locale}`}
            value='eur'
            onValueChange={() => {}}
          />
        </LocaleProvider>,
      )

      expect(screen.getByLabelText(label)).toHaveAttribute('id', `currency-${locale}`)
    },
  )

  it('preserves a caller-supplied label', () => {
    mergeMessages('en', enMessages)
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
