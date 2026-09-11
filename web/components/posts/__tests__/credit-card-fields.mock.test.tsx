import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CreditCardFields } from '../credit-card-fields'

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({ children }: any) => <div>{children}</div>,
      SelectTrigger: ({ children }: any) => <div>{children}</div>,
      SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
      SelectContent: ({ children }: any) => <div>{children}</div>,
      SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
    }) as unknown as typeof import('@/components/ui/select'),
)

vi.mock(import('../topic-autocomplete'), () => ({
  TopicAutocomplete: ({ label, onChange }: any) => (
    <div data-testid='topic-autocomplete'>
      <span data-testid='topic-label'>{label}</span>
      <button
        type='button'
        data-testid='topic-change'
        onClick={() => onChange('new-topic-id', 'New Card')}
      >
        change
      </button>
    </div>
  ),
}))

const noop = () => {}

describe('CreditCardFields', () => {
  it('renders data-point-specific fields: Card, Result, Existing Relationship, Approved Credit Limit, Business Application, Application Method, Application Date', () => {
    render(
      <CreditCardFields
        data={{}}
        onUpdate={noop}
      />,
    )
    expect(screen.getByText('Card *')).toBeDefined()
    expect(screen.getByText('Result *')).toBeDefined()
    expect(screen.getByText('I had an existing relationship with the issuer')).toBeDefined()
    expect(screen.getByText('Approved Credit Limit (optional)')).toBeDefined()
    expect(screen.getByText('This was a business card application')).toBeDefined()
    expect(screen.getByText('Application Method (optional)')).toBeDefined()
    expect(screen.getByText('Application Date (optional)')).toBeDefined()
  })

  it('does NOT render profile-specific fields: Credit Score Range, Stated Income, Hard Inquiries, Cards Opened, Total Credit Limit, Years of Credit History', () => {
    render(
      <CreditCardFields
        data={{}}
        onUpdate={noop}
      />,
    )
    expect(screen.queryByText(/Credit Score Range/)).toBeNull()
    expect(screen.queryByText(/Stated Income Range/)).toBeNull()
    expect(screen.queryByText(/Hard Inquiries/)).toBeNull()
    expect(screen.queryByText(/Cards Opened/)).toBeNull()
    expect(screen.queryByText(/Total Credit Limit \(all cards\)/)).toBeNull()
    expect(screen.queryByText(/Years of Credit History/)).toBeNull()
  })

  it('passes data.topic_name as label to TopicAutocomplete', () => {
    render(
      <CreditCardFields
        data={{ topic_name: 'Chase Sapphire Preferred' }}
        onUpdate={noop}
      />,
    )
    expect(screen.getByTestId('topic-label').textContent).toBe('Chase Sapphire Preferred')
  })

  it('passes empty string as label when topic_name is absent', () => {
    render(
      <CreditCardFields
        data={{}}
        onUpdate={noop}
      />,
    )
    expect(screen.getByTestId('topic-label').textContent).toBe('')
  })

  it('identifies the approved credit-limit input with the selected currency', () => {
    render(
      <CreditCardFields
        data={{ currency: 'eur' }}
        onUpdate={noop}
      />,
    )

    expect(screen.getByLabelText('Approved Credit Limit (optional)')).toHaveAccessibleDescription(
      'EUR',
    )
  })

  it('calls onUpdate for both topic_ids and topic_name when topic changes (regression #3727)', () => {
    const onUpdate = vi.fn<VitestLooseMock>()
    render(
      <CreditCardFields
        data={{ topic_ids: ['old-topic'], topic_name: 'Old Card' }}
        onUpdate={onUpdate}
      />,
    )
    fireEvent.click(screen.getByTestId('topic-change'))
    expect(onUpdate).toHaveBeenCalledWith('topic_ids', ['new-topic-id'])
    expect(onUpdate).toHaveBeenCalledWith('topic_name', 'New Card')
  })
})
