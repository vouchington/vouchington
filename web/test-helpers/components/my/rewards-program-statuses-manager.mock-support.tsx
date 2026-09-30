/* oxlint-disable no-mistakes/playwright-consistent-attribute -- moved test support preserves existing Testing Library selectors */
import { vi } from 'vitest'
import { Input } from '@/components/ui/input'
import type { ListResponse } from '@/types/api-responses'
import type { RewardsProgramStatus } from '@/types/my'

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error/on-success'), () => ({
  onSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/components/posts/topic-autocomplete'),
  () =>
    ({
      TopicAutocomplete: ({
        value,
        onChange,
        placeholder,
      }: {
        value?: string | null
        onChange: (id: string, name: string) => void
        placeholder?: string
      }) => (
        <div data-testid='mock-topic-autocomplete'>
          <Input
            type='text'
            placeholder={placeholder}
            aria-label={placeholder ?? 'Rewards program status'}
            value={value ?? ''}
            onChange={event => onChange(event.target.value, 'Mocked Status')}
            data-testid='mock-topic-autocomplete-input'
          />
        </div>
      ),
    }) as unknown as typeof import('@/components/posts/topic-autocomplete'),
)

vi.mock(import('@/lib/api/client'), () => ({
  createMyRewardsProgramStatus: vi.fn<VitestLooseMock>(),
  updateMyRewardsProgramStatus: vi.fn<VitestLooseMock>(),
  deleteMyRewardsProgramStatus: vi.fn<VitestLooseMock>(),
}))

import {
  createMyRewardsProgramStatus,
  deleteMyRewardsProgramStatus,
  updateMyRewardsProgramStatus,
} from '@/lib/api/client'
import onError from '@/lib/on-error'
import { onSuccess } from '@/lib/on-error/on-success'

export const mockCreate = vi.mocked(createMyRewardsProgramStatus)
export const mockUpdate = vi.mocked(updateMyRewardsProgramStatus)
export const mockDelete = vi.mocked(deleteMyRewardsProgramStatus)
export const mockOnError = vi.mocked(onError)
export const mockOnSuccess = vi.mocked(onSuccess)

export type UpdateRewardsProgramStatusResult = Awaited<
  ReturnType<typeof updateMyRewardsProgramStatus>
>

export const initialStatuses: RewardsProgramStatus[] = [
  {
    id: 'status-user-1',
    rewards_program_status_id: 'stat-1',
    since: '2023-01-01',
    until: null,
    rewards_program_status: {
      id: 'stat-1',
      name: 'Delta Medallion Gold',
      slug: 'delta-gold',
    },
  },
]

export const initialPage: ListResponse<RewardsProgramStatus> = {
  results: initialStatuses,
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}

export function installRewardsProgramStatusMockResponses(): void {
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
    rewards_program_status: {
      id: 'status-user-1',
      rewards_program_status_id: 'stat-1',
      since: '2023-01-01',
      until: '2024-01-01',
      rewards_program_status: {
        id: 'stat-1',
        name: 'Delta Medallion Gold',
        slug: 'delta-gold',
      },
    },
  } as any)
  mockDelete.mockResolvedValue(undefined as any)
}
