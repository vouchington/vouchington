import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import { RewardsProgramStatusesManager } from '../rewards-program-statuses-manager'
import type { ListResponse } from '@/types/api-responses'
import type { RewardsProgramStatus } from '@/types/my'

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
        aria-label={placeholder ?? 'Rewards program status'}
        value={value ?? ''}
        onChange={e => onChange(e.target.value, 'Mocked Status')}
        data-testid='mock-topic-autocomplete-input'
      />
    </div>
  ),
}))

vi.mock(import('@/lib/api/client'), () => ({
  createMyRewardsProgramStatus: vi.fn<VitestLooseMock>(),
  updateMyRewardsProgramStatus: vi.fn<VitestLooseMock>(),
  deleteMyRewardsProgramStatus: vi.fn<VitestLooseMock>(),
}))

import { createMyRewardsProgramStatus, updateMyRewardsProgramStatus } from '@/lib/api/client'

const mockCreate = vi.mocked(createMyRewardsProgramStatus)
const mockUpdate = vi.mocked(updateMyRewardsProgramStatus)

const initialStatuses: RewardsProgramStatus[] = [
  {
    id: 'status-user-1',
    rewards_program_status_id: 'stat-1',
    since: '2023-01-01',
    until: null,
    rewards_program_status: { id: 'stat-1', name: 'Delta Medallion Gold', slug: 'delta-gold' },
  },
]

const initialPage: ListResponse<RewardsProgramStatus> = {
  results: initialStatuses,
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}

describe('RewardsProgramStatusesManager keyboard submit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockCreate.mockResolvedValue({
      rewards_program_status: {
        id: 'status-user-2',
        rewards_program_status_id: 'stat-2',
        since: null,
        until: null,
        rewards_program_status: {
          id: 'stat-2',
          name: 'Marriott Bonvoy Platinum',
          slug: 'marriott-platinum',
        },
      },
    } as any)
    mockUpdate.mockResolvedValue({
      rewards_program_status: { ...initialStatuses[0], until: '2024-01-01' },
    } as any)
  })

  it('selecting an autocomplete option auto-adds (calls create API)', async () => {
    render(<RewardsProgramStatusesManager initialPage={initialPage} />)

    const autocompleteInput = screen.getByTestId('mock-topic-autocomplete-input')
    await act(async () => {
      fireEvent.change(autocompleteInput, { target: { value: 'stat-2' } })
    })

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        rewards_program_status_id: 'stat-2',
      })
    })
  })

  it('Enter on the edit Since date input submits the edit form', () => {
    render(<RewardsProgramStatusesManager initialPage={initialPage} />)

    // Open edit
    fireEvent.click(screen.getByRole('button', { name: /Edit/i }))

    const sinceInput = screen.getByLabelText('Since') as HTMLInputElement
    // Change since so the form sees a real change to save
    fireEvent.change(sinceInput, { target: { value: '2024-06-01' } })

    void expectInputEnterSubmits({ input: sinceInput, onSubmit: mockUpdate })
  })

  it('Enter on the edit Until date input submits the edit form', () => {
    render(<RewardsProgramStatusesManager initialPage={initialPage} />)

    // Open edit
    fireEvent.click(screen.getByRole('button', { name: /Edit/i }))

    const untilInput = screen.getByLabelText('Until') as HTMLInputElement
    fireEvent.change(untilInput, { target: { value: '2024-12-31' } })

    void expectInputEnterSubmits({ input: untilInput, onSubmit: mockUpdate })
  })
})
