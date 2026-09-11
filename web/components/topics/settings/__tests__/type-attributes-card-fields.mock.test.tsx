import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CardFields } from '../type-attributes-card-fields'

vi.mock(
  import('@/components/shared/currency-select'),
  () =>
    ({
      CurrencySelect: ({
        id,
        value,
        onValueChange,
      }: {
        id: string
        value: string
        onValueChange: (value: 'jpy' | 'usd') => void
      }) => (
        <label>
          Currency
          <select
            id={id}
            aria-label='Currency'
            value={value}
            onChange={event => onValueChange(event.target.value as 'jpy' | 'usd')}
          >
            <option value='jpy'>JPY</option>
            <option value='usd'>USD</option>
          </select>
        </label>
      ),
    }) as unknown as typeof import('@/components/shared/currency-select'),
)

vi.mock(import('../type-attributes-fields'), () => ({
  TopicIdAttribute: () => <div />,
}))

describe('CardFields', () => {
  it('updates annual fee precision from the currently selected currency', () => {
    render(
      <CardFields
        typeAttributes={{ annual_fee: { amount: 550, currency: 'jpy' } }}
        getValue={() => null}
        names={{}}
        setId={() => vi.fn<(id: string) => void>()}
        disabled={false}
        annualFeeError={null}
        onAnnualFeeChange={vi.fn<() => void>()}
      />,
    )
    const feeInput = screen.getByRole('textbox', { name: /annual fee/i }) as HTMLInputElement
    expect(feeInput).toHaveAttribute('inputmode', 'decimal')

    fireEvent.change(screen.getByRole('combobox', { name: 'Currency' }), {
      target: { value: 'usd' },
    })

    expect(feeInput).toHaveAttribute('inputmode', 'decimal')
  })

  it('clears an incompatible annual fee draft when switching to JPY', () => {
    render(
      <CardFields
        typeAttributes={{ annual_fee: { amount: 1234, currency: 'usd' } }}
        getValue={() => null}
        names={{}}
        setId={() => vi.fn<(id: string) => void>()}
        disabled={false}
        annualFeeError={null}
        onAnnualFeeChange={vi.fn<() => void>()}
      />,
    )
    const feeInput = screen.getByRole('textbox', { name: /annual fee/i }) as HTMLInputElement
    expect(feeInput.value).toBe('12.34')

    fireEvent.change(screen.getByRole('combobox', { name: 'Currency' }), {
      target: { value: 'jpy' },
    })

    expect(feeInput).toHaveAttribute('inputmode', 'decimal')
    expect(feeInput.value).toBe('')
  })
})
