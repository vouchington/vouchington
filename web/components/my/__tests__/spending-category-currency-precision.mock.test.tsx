import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AddCategoryForm } from '../spending-categories-manager/add-category-form'
import { CategoryList, type EditForm } from '../spending-categories-manager/category-list'
import type { CurrencyCode } from '@ts-shared/money'

vi.mock(import('@/components/posts/topic-autocomplete'), () => ({
  TopicAutocomplete: () => <div />,
}))

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
        value: CurrencyCode
        onValueChange: (value: CurrencyCode) => void
      }) => (
        <label>
          Currency
          <select
            id={id}
            aria-label='Currency'
            value={value}
            onChange={event => onValueChange(event.target.value as CurrencyCode)}
          >
            <option value='jpy'>JPY</option>
            <option value='usd'>USD</option>
          </select>
        </label>
      ),
    }) as unknown as typeof import('@/components/shared/currency-select'),
)

function AddFormHarness() {
  const [amount, setAmount] = useState('12.34')
  const [currency, setCurrency] = useState<CurrencyCode>('usd')
  return (
    <AddCategoryForm
      loading={false}
      newAmount={amount}
      newCurrency={currency}
      newCategoryId='category-1'
      newCategoryLabel='Dining'
      newFrequency='monthly'
      newNote=''
      onAdd={() => undefined}
      setNewAmount={setAmount}
      setNewCurrency={setCurrency}
      setNewCategoryId={() => undefined}
      setNewCategoryLabel={() => undefined}
      setNewFrequency={() => undefined}
      setNewNote={() => undefined}
    />
  )
}

function EditFormHarness() {
  const [editForm, setEditForm] = useState<EditForm>({
    amount: '12.34',
    currency: 'usd',
    spending_frequency: 'monthly',
    note: '',
  })
  return (
    <CategoryList
      categories={[
        {
          id: 'spending-1',
          spending_category_id: 'category-1',
          amount: { amount: 1234, currency: 'usd' },
          spending_frequency: 'monthly',
          note: null,
          spending_category: { id: 'category-1', name: 'Dining', slug: 'dining' },
        },
      ]}
      confirmingDeleteId={null}
      editForm={editForm}
      editingId='spending-1'
      loadingIds={new Set()}
      onDelete={() => undefined}
      onSave={() => undefined}
      onStartEdit={() => undefined}
      setConfirmingDeleteId={() => undefined}
      setEditForm={setEditForm}
      setEditingId={() => undefined}
    />
  )
}

describe('spending category currency precision', () => {
  it('clears an incompatible add-form draft when switching to JPY', () => {
    render(<AddFormHarness />)
    const input = screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement
    expect(input).toHaveAttribute('inputmode', 'decimal')

    fireEvent.change(screen.getByRole('combobox', { name: 'Currency' }), {
      target: { value: 'jpy' },
    })

    expect(input.value).toBe('')
  })

  it('clears an incompatible edit-form draft when switching to JPY', () => {
    render(<EditFormHarness />)
    const input = screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement
    expect(input).toHaveAttribute('inputmode', 'decimal')

    fireEvent.change(screen.getByRole('combobox', { name: 'Currency' }), {
      target: { value: 'jpy' },
    })

    expect(input.value).toBe('')
  })
})
