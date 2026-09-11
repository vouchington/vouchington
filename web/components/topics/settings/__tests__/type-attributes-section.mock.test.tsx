import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TypeAttributesSection } from '../type-attributes-section'

vi.mock(import('@/lib/api/client/topics'), () => ({
  fetchTopics: vi.fn<VitestLooseMock>().mockResolvedValue({
    topics: {},
    results: [],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    topics_metrics: {},
  }),
}))

// Mock TopicAutocomplete to a simple controllable stub. The `label` prop carries
// the server-seeded name; the `edit` button simulates clearOnTextEdit clearing.
vi.mock(
  import('@/components/posts/topic-autocomplete'),
  () =>
    ({
      TopicAutocomplete: ({
        id,
        label,
        value,
        onChange,
      }: {
        id?: string
        label: string
        value: string | null
        onChange: (id: string) => void
        clearOnTextEdit?: boolean
      }) => (
        <div data-testid={`topic-autocomplete-${id ?? label}`}>
          <span data-testid={`label-${id ?? label}`}>{label}</span>
          <input
            aria-label={label}
            data-testid={`input-${id ?? label}`}
            value={value ?? ''}
            readOnly
          />
          <button
            type='button'
            data-testid={`select-${id ?? label}`}
            onClick={() => onChange(`selected-id-for-${id ?? label}`)}
          >
            select
          </button>
          <button
            type='button'
            data-testid={`edit-${id ?? label}`}
            onClick={() => onChange('')}
          >
            edit
          </button>
        </div>
      ),
    }) as unknown as typeof import('@/components/posts/topic-autocomplete'),
)

describe('TypeAttributesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing for null topic type', () => {
    const { container } = render(
      <TypeAttributesSection
        topicId='topic-1'
        currentTopicType={null}
        onTypeAttrSubmit={vi.fn<VitestLooseMock>()}
        typeAttributes={null}
        typeAttributeNames={{}}
        typeAttrSaving={false}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for unknown topic type', () => {
    const { container } = render(
      <TypeAttributesSection
        topicId='topic-1'
        currentTopicType='unknown_type'
        onTypeAttrSubmit={vi.fn<VitestLooseMock>()}
        typeAttributes={null}
        typeAttributeNames={{}}
        typeAttrSaving={false}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders a TopicAutocomplete for Company field for rewards_program type', () => {
    render(
      <TypeAttributesSection
        topicId='topic-1'
        currentTopicType='rewards_program'
        onTypeAttrSubmit={vi.fn<VitestLooseMock>()}
        typeAttributes={null}
        typeAttributeNames={{}}
        typeAttrSaving={false}
      />,
    )
    expect(screen.getByTestId('topic-autocomplete-company_id')).toBeDefined()
    // Visible field label rendered by TopicIdAttribute's <Label>
    expect(screen.getByText('Company')).toBeDefined()
    // No raw "Company ID" text input
    expect(screen.queryByPlaceholderText('Company topic ID')).toBeNull()
  })

  it('renders two TopicAutocompletes for referral_program type: Company and Rewards Program', () => {
    render(
      <TypeAttributesSection
        topicId='topic-1'
        currentTopicType='referral_program'
        onTypeAttrSubmit={vi.fn<VitestLooseMock>()}
        typeAttributes={null}
        typeAttributeNames={{}}
        typeAttrSaving={false}
      />,
    )
    expect(screen.getByTestId('topic-autocomplete-company_id')).toBeDefined()
    expect(screen.getByTestId('topic-autocomplete-rewards_program_id')).toBeDefined()
  })

  it('renders four TopicAutocompletes and an annual_fee decimal text input for card type', () => {
    render(
      <TypeAttributesSection
        topicId='topic-1'
        currentTopicType='card'
        onTypeAttrSubmit={vi.fn<VitestLooseMock>()}
        typeAttributes={null}
        typeAttributeNames={{}}
        typeAttrSaving={false}
      />,
    )
    expect(screen.getByTestId('topic-autocomplete-bank_id')).toBeDefined()
    expect(screen.getByTestId('topic-autocomplete-brand_id')).toBeDefined()
    expect(screen.getByTestId('topic-autocomplete-rewards_program_id')).toBeDefined()
    expect(screen.getByTestId('topic-autocomplete-referral_program_id')).toBeDefined()
    const annualFeeInput = screen.getByRole('textbox', { name: /annual fee/i }) as HTMLInputElement
    expect(annualFeeInput.name).toBe('annual_fee_amount')
  })

  it('renders two TopicAutocompletes and order_index number input for rewards_program_status type', () => {
    render(
      <TypeAttributesSection
        topicId='topic-1'
        currentTopicType='rewards_program_status'
        onTypeAttrSubmit={vi.fn<VitestLooseMock>()}
        typeAttributes={null}
        typeAttributeNames={{}}
        typeAttrSaving={false}
      />,
    )
    expect(screen.getByTestId('topic-autocomplete-rewards_program_id')).toBeDefined()
    expect(screen.getByTestId('topic-autocomplete-lifetime_version_id')).toBeDefined()
    const orderIndexInput = screen.getByRole('spinbutton') as HTMLInputElement
    expect(orderIndexInput.name).toBe('order_index')
  })

  it('seeds each field autocomplete with the saved topic name from typeAttributeNames', () => {
    render(
      <TypeAttributesSection
        topicId='topic-1'
        currentTopicType='card'
        onTypeAttrSubmit={vi.fn<VitestLooseMock>()}
        typeAttributes={{ bank_id: 'bank-1', brand_id: 'brand-1' }}
        typeAttributeNames={{ bank_id: 'Chase', brand_id: 'Sapphire' }}
        typeAttrSaving={false}
      />,
    )
    expect(screen.getByTestId('label-bank_id').textContent).toBe('Chase')
    expect(screen.getByTestId('label-brand_id').textContent).toBe('Sapphire')
  })

  it('includes existing typeAttributes id in submit payload when no new selection is made', () => {
    const handleSubmit = vi.fn<VitestLooseMock>()
    render(
      <TypeAttributesSection
        topicId='topic-1'
        currentTopicType='rewards_program'
        onTypeAttrSubmit={handleSubmit}
        typeAttributes={{ company_id: 'existing-company-id' }}
        typeAttributeNames={{ company_id: 'Existing Co' }}
        typeAttrSaving={false}
      />,
    )
    // Submit without making any new selection — should include the existing id
    fireEvent.click(screen.getByRole('button', { name: 'Save Type Attributes' }))
    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: 'existing-company-id' }),
    )
  })

  it('omits a field whose id was cleared by editing search text (no stale write)', () => {
    const handleSubmit = vi.fn<VitestLooseMock>()
    render(
      <TypeAttributesSection
        topicId='topic-1'
        currentTopicType='rewards_program'
        onTypeAttrSubmit={handleSubmit}
        typeAttributes={{ company_id: 'existing-company-id' }}
        typeAttributeNames={{ company_id: 'Existing Co' }}
        typeAttrSaving={false}
      />,
    )
    // Editing the search text clears the stored id (clearOnTextEdit -> onChange(''))
    fireEvent.click(screen.getByTestId('edit-company_id'))
    fireEvent.click(screen.getByRole('button', { name: 'Save Type Attributes' }))
    expect(handleSubmit).toHaveBeenCalledWith(
      expect.not.objectContaining({ company_id: expect.anything() }),
    )
  })

  it('passes selected topic id to onTypeAttrSubmit on form submit', () => {
    const handleSubmit = vi.fn<VitestLooseMock>()
    render(
      <TypeAttributesSection
        topicId='topic-1'
        currentTopicType='rewards_program'
        onTypeAttrSubmit={handleSubmit}
        typeAttributes={null}
        typeAttributeNames={{}}
        typeAttrSaving={false}
      />,
    )
    // Select a topic
    fireEvent.click(screen.getByTestId('select-company_id'))
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: 'Save Type Attributes' }))
    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: 'selected-id-for-company_id' }),
    )
  })

  it('includes numeric annual_fee in onTypeAttrSubmit data for card type', () => {
    const handleSubmit = vi.fn<VitestLooseMock>()
    render(
      <TypeAttributesSection
        topicId='topic-1'
        currentTopicType='card'
        onTypeAttrSubmit={handleSubmit}
        typeAttributes={null}
        typeAttributeNames={{}}
        typeAttrSaving={false}
      />,
    )
    const feeInput = screen.getByRole('textbox', { name: /annual fee/i }) as HTMLInputElement
    fireEvent.change(feeInput, { target: { value: '95' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Type Attributes' }))
    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ annual_fee: { amount: 9500, currency: 'usd' } }),
    )
  })

  it('omits null id fields from onTypeAttrSubmit data', () => {
    const handleSubmit = vi.fn<VitestLooseMock>()
    render(
      <TypeAttributesSection
        topicId='topic-1'
        currentTopicType='rewards_program'
        onTypeAttrSubmit={handleSubmit}
        typeAttributes={null}
        typeAttributeNames={{}}
        typeAttrSaving={false}
      />,
    )
    // Do not select anything, just submit
    fireEvent.click(screen.getByRole('button', { name: 'Save Type Attributes' }))
    expect(handleSubmit).toHaveBeenCalledWith(
      expect.not.objectContaining({ company_id: expect.anything() }),
    )
  })
})
