import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BankAccountMoneyInput } from '../bank-account-money-input'
import type { Money } from '@ts-shared/money'
import { UiLocaleContext } from '@/lib/i18n/ui-locale-context'
import { seedMessages } from '@/lib/i18n/use-translations'
import { esMessages, frMessages, ptMessages } from '@ts-shared/ui-messages/locale-catalogs'

describe('BankAccountMoneyInput', () => {
  seedMessages('es', esMessages)
  seedMessages('fr', frMessages)
  seedMessages('pt', ptMessages)

  it.each([
    ['usd', 'USD'],
    ['eur', 'EUR'],
    ['gbp', 'GBP'],
    ['jpy', 'JPY'],
  ] as const)('identifies %s inputs with an unambiguous currency code', (currency, expected) => {
    render(
      <BankAccountMoneyInput
        id={`${currency}-amount`}
        label={`${expected} amount`}
        money={null}
        currency={currency}
        onChange={() => {}}
      />,
    )

    const input = screen.getByLabelText(`${expected} amount`)
    const indicator = screen.getByText(expected)
    expect(indicator).toHaveAttribute('id', `${currency}-amount-currency`)
    expect(input).toHaveAccessibleDescription(expected)
  })

  it('renders minor units as major units and emits Money on change', () => {
    const onChange = vi.fn<(money: Money | null) => void>()
    render(
      <BankAccountMoneyInput
        id='amount'
        label='Amount'
        money={{ amount: 12_345, currency: 'usd' }}
        currency='usd'
        onChange={onChange}
      />,
    )

    const input = screen.getByLabelText('Amount')
    expect(input).toHaveValue('123.45')

    fireEvent.change(input, { target: { value: '45.67' } })
    expect(onChange).toHaveBeenCalledWith({ amount: 4567, currency: 'usd' })

    fireEvent.change(input, { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it.each([
    ['dp-ba-bonus', 'Bank bonus', 'es'],
    ['dp-cc-limit', 'Credit limit', 'fr'],
    ['dp-profile-income-minimum', 'Income minimum', 'pt'],
  ])('accepts a locale decimal in the shared %s money path', (id, label, locale) => {
    const onChange = vi.fn<(money: Money | null) => void>()

    function LocalizedControlledInput() {
      const [money, setMoney] = useState<Money | null>(null)
      return (
        <BankAccountMoneyInput
          id={id}
          label={label}
          money={money}
          currency='usd'
          onChange={next => {
            onChange(next)
            setMoney(next)
          }}
        />
      )
    }

    render(
      <UiLocaleContext.Provider value={locale}>
        <LocalizedControlledInput />
      </UiLocaleContext.Provider>,
    )

    const input = screen.getByLabelText(label)
    fireEvent.change(input, { target: { value: '12,34' } })

    expect(input).toHaveValue('12,34')
    expect(onChange).toHaveBeenCalledWith({ amount: 1234, currency: 'usd' })
  })

  it('retains a trailing decimal draft until subsequent cents make it valid', () => {
    const onChange = vi.fn<(money: Money | null) => void>()

    function ControlledMoneyInput() {
      const [money, setMoney] = useState<Money | null>(null)
      return (
        <>
          <BankAccountMoneyInput
            id='controlled-amount'
            label='Controlled amount'
            money={money}
            currency='usd'
            onChange={next => {
              onChange(next)
              setMoney(next)
            }}
          />
          <output data-testid='minor-units'>{money?.amount ?? 'empty'}</output>
        </>
      )
    }

    render(<ControlledMoneyInput />)
    const input = screen.getByLabelText('Controlled amount')

    fireEvent.change(input, { target: { value: '12' } })
    expect(input).toHaveValue('12')
    expect(screen.getByTestId('minor-units')).toHaveTextContent('1200')

    fireEvent.change(input, { target: { value: '12.' } })
    expect(input).toHaveValue('12.')
    expect(screen.getByTestId('minor-units')).toHaveTextContent('1200')
    expect(onChange).toHaveBeenLastCalledWith({ amount: 1200, currency: 'usd' })

    fireEvent.change(input, { target: { value: '12.3' } })
    expect(input).toHaveValue('12.3')
    expect(screen.getByTestId('minor-units')).toHaveTextContent('1230')

    fireEvent.change(input, { target: { value: '12.34' } })
    expect(input).toHaveValue('12.34')
    expect(screen.getByTestId('minor-units')).toHaveTextContent('1234')
    expect(onChange).toHaveBeenLastCalledWith({ amount: 1234, currency: 'usd' })

    const validCallCount = onChange.mock.calls.length
    for (const invalidDraft of ['.5', '00', '12.345', '12x', '90071992547409.92']) {
      fireEvent.change(input, { target: { value: invalidDraft } })
      expect(input).toHaveValue('12.34')
      expect(screen.getByTestId('minor-units')).toHaveTextContent('1234')
    }
    expect(onChange).toHaveBeenCalledTimes(validCallCount)
  })

  it('keeps a trailing dot when editing existing decimal money to whole units', () => {
    const onChange = vi.fn<(money: Money | null) => void>()

    function ExistingMoneyInput() {
      const [money, setMoney] = useState<Money | null>({ amount: 1234, currency: 'usd' })
      return (
        <>
          <BankAccountMoneyInput
            id='existing-amount'
            label='Existing amount'
            money={money}
            currency='usd'
            onChange={next => {
              onChange(next)
              setMoney(next)
            }}
          />
          <output data-testid='existing-minor-units'>{money?.amount ?? 'empty'}</output>
        </>
      )
    }

    render(<ExistingMoneyInput />)
    const input = screen.getByLabelText('Existing amount')
    expect(input).toHaveValue('12.34')

    fireEvent.change(input, { target: { value: '12.' } })

    expect(input).toHaveValue('12.')
    expect(screen.getByTestId('existing-minor-units')).toHaveTextContent('1200')
    expect(onChange).toHaveBeenLastCalledWith({ amount: 1200, currency: 'usd' })
  })

  it('resets an incomplete draft when external money or currency changes', () => {
    const onChange = vi.fn<(money: Money | null) => void>()
    const { rerender } = render(
      <BankAccountMoneyInput
        id='reset-amount'
        label='Reset amount'
        money={{ amount: 1200, currency: 'usd' }}
        currency='usd'
        onChange={onChange}
      />,
    )
    const input = screen.getByLabelText('Reset amount')

    fireEvent.change(input, { target: { value: '12.' } })
    expect(input).toHaveValue('12.')

    rerender(
      <BankAccountMoneyInput
        id='reset-amount'
        label='Reset amount'
        money={{ amount: 500, currency: 'jpy' }}
        currency='jpy'
        onChange={onChange}
      />,
    )
    expect(input).toHaveValue('500')
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).toHaveAccessibleDescription('JPY')
    expect(screen.queryByText('USD')).toBeNull()

    fireEvent.change(input, { target: { value: '500.' } })
    expect(input).toHaveValue('500')

    rerender(
      <BankAccountMoneyInput
        id='reset-amount'
        label='Reset amount'
        money={{ amount: 100, currency: 'usd' }}
        currency='usd'
        onChange={onChange}
      />,
    )
    expect(input).toHaveValue('1')
    expect(input).toHaveAttribute('inputmode', 'decimal')
    expect(input).toHaveAccessibleDescription('USD')
    expect(screen.queryByText('JPY')).toBeNull()
  })

  it('resets a localized incomplete draft when the active locale changes', () => {
    const onChange = vi.fn<(money: Money | null) => void>()
    const { rerender } = render(
      <UiLocaleContext.Provider value='es'>
        <BankAccountMoneyInput
          id='locale-reset-amount'
          label='Locale reset amount'
          money={{ amount: 1200, currency: 'usd' }}
          currency='usd'
          onChange={onChange}
        />
      </UiLocaleContext.Provider>,
    )
    const input = screen.getByLabelText('Locale reset amount')

    fireEvent.change(input, { target: { value: '12,' } })
    expect(input).toHaveValue('12,')

    rerender(
      <UiLocaleContext.Provider value='en'>
        <BankAccountMoneyInput
          id='locale-reset-amount'
          label='Locale reset amount'
          money={{ amount: 1200, currency: 'usd' }}
          currency='usd'
          onChange={onChange}
        />
      </UiLocaleContext.Provider>,
    )

    expect(input).toHaveValue('12')
  })
})
