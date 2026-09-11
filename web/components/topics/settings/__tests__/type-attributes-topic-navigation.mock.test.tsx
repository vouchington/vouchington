import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TypeAttributes } from '../topic-edit-model'
import { TypeAttributesSection } from '../type-attributes-section'

vi.mock(
  import('@/components/posts/topic-autocomplete'),
  () =>
    ({
      TopicAutocomplete: ({
        id,
        value,
        onChange,
      }: {
        id?: string
        value: string | null
        onChange: (id: string) => void
      }) => (
        <>
          <input
            aria-label={`${id} value`}
            value={value ?? ''}
            readOnly
          />
          <button
            type='button'
            data-testid={`select-${id}`}
            onClick={() => onChange(`selected-id-for-${id}`)}
          >
            Select
          </button>
        </>
      ),
    }) as unknown as typeof import('@/components/posts/topic-autocomplete'),
)

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

function editor({
  topicId,
  typeAttributes,
  onSubmit,
}: {
  topicId: string
  typeAttributes: TypeAttributes
  onSubmit: (data: Record<string, unknown>) => void
}) {
  return (
    <TypeAttributesSection
      topicId={topicId}
      currentTopicType='card'
      onTypeAttrSubmit={onSubmit}
      typeAttributes={typeAttributes}
      typeAttributeNames={{}}
      typeAttrSaving={false}
    />
  )
}

describe('TypeAttributesSection topic navigation', () => {
  it('shows invalid annual fee drafts without submitting', () => {
    const onSubmit = vi.fn<VitestLooseMock>()
    render(
      editor({
        topicId: 'topic-a',
        typeAttributes: { annual_fee: null },
        onSubmit,
      }),
    )
    const annualFee = screen.getByRole('textbox', {
      name: /annual fee/i,
    }) as HTMLInputElement

    for (const invalidValue of ['1e2', '90071992547409.92']) {
      fireEvent.change(annualFee, { target: { value: invalidValue } })
      fireEvent.click(screen.getByRole('button', { name: /save type attributes/i }))

      expect(onSubmit).not.toHaveBeenCalled()
      expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid amount')
      expect(annualFee).toHaveAttribute('aria-invalid', 'true')
    }

    fireEvent.change(annualFee, { target: { value: '95' } })
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /save type attributes/i }))
    expect(onSubmit).toHaveBeenCalledWith({
      annual_fee: { amount: 9500, currency: 'usd' },
    })
  })

  it('preserves same-topic drafts but loads and submits each new topic state', () => {
    const onSubmit = vi.fn<VitestLooseMock>()
    const view = render(
      editor({
        topicId: 'topic-a',
        typeAttributes: {
          annual_fee: { amount: 1234, currency: 'usd' },
          bank_id: 'bank-a',
        },
        onSubmit,
      }),
    )
    const annualFee = screen.getByRole('textbox', {
      name: /annual fee/i,
    }) as HTMLInputElement

    expect(annualFee.value).toBe('12.34')
    fireEvent.change(annualFee, { target: { value: '99.99' } })
    fireEvent.click(screen.getByTestId('select-bank_id'))

    view.rerender(
      editor({
        topicId: 'topic-a',
        typeAttributes: {
          annual_fee: { amount: 1234, currency: 'usd' },
          bank_id: 'bank-a',
        },
        onSubmit,
      }),
    )
    expect(annualFee.value).toBe('99.99')
    expect(screen.getByRole('textbox', { name: 'bank_id value' })).toHaveValue(
      'selected-id-for-bank_id',
    )

    view.rerender(
      editor({
        topicId: 'topic-b',
        typeAttributes: {
          annual_fee: { amount: 550, currency: 'jpy' },
          bank_id: 'bank-b',
        },
        onSubmit,
      }),
    )
    const topicBFee = screen.getByRole('textbox', {
      name: /annual fee/i,
    }) as HTMLInputElement
    expect(topicBFee.value).toBe('550')
    expect(topicBFee).toHaveAttribute('inputmode', 'decimal')
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveValue('jpy')
    expect(screen.getByRole('textbox', { name: 'bank_id value' })).toHaveValue('bank-b')

    fireEvent.click(screen.getByRole('button', { name: /save type attributes/i }))
    expect(onSubmit).toHaveBeenLastCalledWith({
      annual_fee: { amount: 550, currency: 'jpy' },
      bank_id: 'bank-b',
    })

    onSubmit.mockClear()
    view.rerender(
      editor({
        topicId: 'topic-c',
        typeAttributes: { annual_fee: null, bank_id: 'bank-c' },
        onSubmit,
      }),
    )
    const topicCFee = screen.getByRole('textbox', {
      name: /annual fee/i,
    }) as HTMLInputElement
    expect(topicCFee.value).toBe('')
    expect(topicCFee).toHaveAttribute('inputmode', 'decimal')
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveValue('usd')

    fireEvent.click(screen.getByRole('button', { name: /save type attributes/i }))
    expect(onSubmit).toHaveBeenCalledWith({ bank_id: 'bank-c' })
  })
})
