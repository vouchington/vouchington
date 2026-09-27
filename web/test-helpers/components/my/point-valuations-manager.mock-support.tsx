/* oxlint-disable no-mistakes/playwright-consistent-attribute -- moved test support preserves existing Testing Library selectors */
import { vi } from 'vitest'
import { Input } from '@/components/ui/input'
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
      <Input
        type='text'
        placeholder={placeholder}
        aria-label={placeholder ?? 'Rewards program'}
        value={value ?? ''}
        onChange={event => onChange(event.target.value, 'Mocked Program')}
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
  deleteMyRewardsProgramPointValuation,
  updateMyRewardsProgramPointValuation,
} from '@/lib/api/client'
import onError from '@/lib/on-error'
import { onSuccess } from '@/lib/on-error/on-success'

export const mockCreatePointValuation = vi.mocked(createMyRewardsProgramPointValuation)
export const mockUpdatePointValuation = vi.mocked(updateMyRewardsProgramPointValuation)
export const mockDeletePointValuation = vi.mocked(deleteMyRewardsProgramPointValuation)
export const mockPointValuationOnError = vi.mocked(onError)
export const mockPointValuationOnSuccess = vi.mocked(onSuccess)

export const initialPointValuations: PointValuation[] = [
  {
    id: 'pv-1',
    rewards_program_id: 'prog-1',
    value_per_point: { amount: 15_000, currency: 'usd', scale: 6 },
    note: 'Initial note',
    rewards_program: { id: 'prog-1', name: 'Chase Ultimate Rewards', slug: 'chase-ur' },
  },
]

export const initialPointValuationData = {
  results: initialPointValuations,
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}

export function installPointValuationMockResponses(): void {
  mockCreatePointValuation.mockResolvedValue({
    point_valuation: {
      id: 'pv-2',
      rewards_program_id: 'prog-2',
      value_per_point: { amount: 20_000, currency: 'usd', scale: 6 },
      note: 'New program note',
      rewards_program: { id: 'prog-2', name: 'Amex Membership Rewards', slug: 'amex-mr' },
    },
  } as any)
  mockUpdatePointValuation.mockResolvedValue({
    point_valuation: {
      id: 'pv-1',
      rewards_program_id: 'prog-1',
      value_per_point: { amount: 18_000, currency: 'usd', scale: 6 },
      note: 'Updated Chase Note',
      rewards_program: { id: 'prog-1', name: 'Chase Ultimate Rewards', slug: 'chase-ur' },
    },
  } as any)
  mockDeletePointValuation.mockResolvedValue(undefined as any)
}
