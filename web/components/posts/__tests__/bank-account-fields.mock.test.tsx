import { fireEvent, render, screen } from '@testing-library/react'
import type { CurrencyCode, Money } from '@ts-shared/money'
import { describe, expect, it, vi } from 'vitest'
import { BankAccountFields } from '../bank-account-fields'

vi.mock(
  import('@/components/ui/checkbox'),
  () =>
    ({
      Checkbox: () => null,
    }) as unknown as typeof import('@/components/ui/checkbox'),
)

vi.mock(import('../bank-account-money-input'), () => ({
  BankAccountMoneyInput: ({
    id,
    label,
    currency,
    onChange,
  }: {
    id: string
    label: string
    currency: CurrencyCode
    onChange: (money: Money | null) => void
  }) => (
    <button
      type='button'
      data-testid={id}
      onClick={() => onChange({ amount: 12_300, currency })}
    >
      {label} <span data-testid={`${id}-currency`}>{currency.toUpperCase()}</span>
    </button>
  ),
}))

vi.mock(import('../topic-autocomplete'), () => ({
  TopicAutocomplete: ({
    label,
    onChange,
  }: {
    label: string
    onChange: (id: string, name: string) => void
  }) => (
    <div data-testid='topic-autocomplete'>
      <span data-testid='topic-label'>{label}</span>
      <button
        type='button'
        data-testid='topic-change'
        onClick={() => onChange('new-bank-id', 'Chase Total Checking')}
      >
        change
      </button>
    </div>
  ),
}))

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      SelectTrigger: ({ children }: { children: React.ReactNode }) => (
        <button type='button'>{children}</button>
      ),
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

const noop = () => {}

describe('BankAccountFields', () => {
  it('passes data.topic_name as label to TopicAutocomplete', () => {
    render(
      <BankAccountFields
        data={{ topic_name: 'Chase Total Checking' }}
        onUpdate={noop}
      />,
    )
    expect(screen.getByTestId('topic-label')).toHaveTextContent('Chase Total Checking')
  })

  it('passes empty string as label when topic_name is absent', () => {
    render(
      <BankAccountFields
        data={{}}
        onUpdate={noop}
      />,
    )
    expect(screen.getByTestId('topic-label')).toHaveTextContent('')
  })

  it('calls onUpdate for both topic_ids and topic_name when topic changes (regression #3727)', () => {
    const onUpdate = vi.fn<(key: string, value: unknown) => void>()
    render(
      <BankAccountFields
        data={{ topic_ids: ['old-bank'], topic_name: 'Old Bank' }}
        onUpdate={onUpdate}
      />,
    )
    fireEvent.click(screen.getByTestId('topic-change'))
    expect(onUpdate).toHaveBeenCalledWith('topic_ids', ['new-bank-id'])
    expect(onUpdate).toHaveBeenCalledWith('topic_name', 'Chase Total Checking')
  })

  it('updates bonus and minimum balance money fields', () => {
    const onUpdate = vi.fn<(key: string, value: unknown) => void>()
    render(
      <BankAccountFields
        data={{ currency: 'gbp' }}
        onUpdate={onUpdate}
      />,
    )

    expect(screen.getByTestId('dp-ba-bonus-currency')).toHaveTextContent('GBP')
    expect(screen.getByTestId('dp-ba-min-balance-currency')).toHaveTextContent('GBP')
    fireEvent.click(screen.getByTestId('dp-ba-bonus'))
    expect(onUpdate).toHaveBeenCalledWith('bonus_amount', {
      amount: 12_300,
      currency: 'gbp',
    })

    fireEvent.click(screen.getByTestId('dp-ba-min-balance'))
    expect(onUpdate).toHaveBeenCalledWith('minimum_balance_requirement', {
      amount: 12_300,
      currency: 'gbp',
    })
  })
})
