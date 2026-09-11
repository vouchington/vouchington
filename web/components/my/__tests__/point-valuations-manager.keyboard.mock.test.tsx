import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import { PointValuationsManager } from '../point-valuations-manager'
import type { PointValuation } from '@/types/my'

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error/on-success'), () => ({
  onSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/posts/topic-autocomplete'), () => ({
  TopicAutocomplete: ({ value, onChange, placeholder }: any) => (
    <div data-testid='mock-topic-autocomplete'>
      <input
        type='text'
        placeholder={placeholder}
        aria-label={placeholder ?? 'Rewards program'}
        value={value ?? ''}
        onChange={e => onChange(e.target.value, 'Mocked Program')}
        data-testid='mock-topic-autocomplete-input'
      />
    </div>
  ),
}))

vi.mock(import('@/lib/api/client'), () => ({
  createMyRewardsProgramPointValuation: vi.fn<VitestLooseMock>(),
  updateMyRewardsProgramPointValuation: vi.fn<VitestLooseMock>(),
  deleteMyRewardsProgramPointValuation: vi.fn<VitestLooseMock>(),
}))

import {
  createMyRewardsProgramPointValuation,
  updateMyRewardsProgramPointValuation,
} from '@/lib/api/client'

const mockCreate = vi.mocked(createMyRewardsProgramPointValuation)
const mockUpdate = vi.mocked(updateMyRewardsProgramPointValuation)

const initialValuations: PointValuation[] = [
  {
    id: 'pv-1',
    rewards_program_id: 'prog-1',
    value_per_point: { amount: 15_000, currency: 'usd', scale: 6 },
    note: 'Initial note',
    rewards_program: { id: 'prog-1', name: 'Chase Ultimate Rewards', slug: 'chase-ur' },
  },
]
const initialData = {
  results: initialValuations,
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}

describe('PointValuationsManager keyboard submit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockCreate.mockResolvedValue({
      point_valuation: {
        id: 'pv-2',
        rewards_program_id: 'prog-2',
        value_per_point: { amount: 20_000, currency: 'usd', scale: 6 },
        note: null,
        rewards_program: { id: 'prog-2', name: 'Amex MR', slug: 'amex-mr' },
      },
    } as any)
    mockUpdate.mockResolvedValue({
      point_valuation: { ...initialValuations[0], note: 'Updated note' },
    } as any)
  })

  it('Enter on the value-per-point input submits the add form', () => {
    render(<PointValuationsManager initialData={initialData} />)

    // Select a program to enable submission
    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    fireEvent.change(autocompleteInput, { target: { value: 'prog-2' } })

    // Fill in cpp
    const cppInput = screen.getByLabelText('Value per point') as HTMLInputElement
    fireEvent.change(cppInput, { target: { value: '0.02' } })

    void expectInputEnterSubmits({ input: cppInput, onSubmit: mockCreate })
  })

  it('Cmd+Enter on add form note textarea submits', () => {
    render(<PointValuationsManager initialData={initialData} />)
    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    fireEvent.change(autocompleteInput, { target: { value: 'prog-2' } })
    const cppInput = screen.getByLabelText('Value per point')
    fireEvent.change(cppInput, { target: { value: '0.02' } })
    const noteTextarea = screen.getByLabelText('Note (optional)') as HTMLTextAreaElement
    mockCreate.mockClear()
    fireEvent.keyDown(noteTextarea, { key: 'Enter', metaKey: true })
    expect(mockCreate).toHaveBeenCalled()
  })

  it('Ctrl+Enter on add form note textarea submits', () => {
    render(<PointValuationsManager initialData={initialData} />)
    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    fireEvent.change(autocompleteInput, { target: { value: 'prog-2' } })
    const cppInput = screen.getByLabelText('Value per point')
    fireEvent.change(cppInput, { target: { value: '0.02' } })
    const noteTextarea = screen.getByLabelText('Note (optional)') as HTMLTextAreaElement
    mockCreate.mockClear()
    fireEvent.keyDown(noteTextarea, { key: 'Enter', ctrlKey: true })
    expect(mockCreate).toHaveBeenCalled()
  })

  it('plain Enter on add form note textarea does not submit', () => {
    render(<PointValuationsManager initialData={initialData} />)
    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    fireEvent.change(autocompleteInput, { target: { value: 'prog-2' } })
    const cppInput = screen.getByLabelText('Value per point')
    fireEvent.change(cppInput, { target: { value: '0.02' } })
    const noteTextarea = screen.getByLabelText('Note (optional)') as HTMLTextAreaElement
    mockCreate.mockClear()
    fireEvent.keyDown(noteTextarea, { key: 'Enter' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('edit form has a submit button wired to the save handler', async () => {
    render(<PointValuationsManager initialData={initialData} />)

    // Open edit — both edit and add forms are visible; edit form is first in DOM
    fireEvent.click(screen.getByRole('button', { name: /Edit/i }))

    // Change a field so handleSave doesn't early-exit
    const cppInput = screen.getAllByLabelText('Value per point')[0] as HTMLInputElement
    fireEvent.change(cppInput, { target: { value: '2.0' } })

    // Verify the edit form has a type=submit button and form submit calls the API
    const saveButton = screen.getByRole('button', { name: /Save/i })
    expect(saveButton).toHaveAttribute('type', 'submit')
    const editForm = saveButton.closest('form')!
    mockUpdate.mockClear()
    fireEvent.submit(editForm)
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled())
  })

  it('Cmd+Enter on the edit note textarea submits the edit form', async () => {
    render(<PointValuationsManager initialData={initialData} />)

    // Open edit
    fireEvent.click(screen.getByRole('button', { name: /Edit/i }))

    // Change a field so handleSave doesn't early-exit
    const cppInput = screen.getAllByLabelText('Value per point')[0] as HTMLInputElement
    fireEvent.change(cppInput, { target: { value: '2.0' } })

    const noteTextarea = screen.getByLabelText('Note') as HTMLTextAreaElement

    // Plain Enter on textarea must not submit
    mockUpdate.mockClear()
    fireEvent.keyDown(noteTextarea, { key: 'Enter' })
    expect(mockUpdate).not.toHaveBeenCalled()

    // Cmd+Enter submits
    mockUpdate.mockClear()
    fireEvent.keyDown(noteTextarea, { key: 'Enter', metaKey: true })
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled())
  })
})
