import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { VoteIntegrityFlagsClient } from './vote-integrity-flags-client'

const mockReplace = vi.fn<VitestLooseMock>()

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({
        replace: mockReplace,
        refresh: vi.fn<VitestLooseMock>(),
      }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        value,
        onValueChange,
        children,
      }: {
        value: string
        onValueChange: (value: string) => void
        children: ReactNode
      }) => (
        <div>
          <div>{`Filter: ${value}`}</div>
          <button
            type='button'
            onClick={() => onValueChange('resolved')}
          >
            set resolved
          </button>
          {children}
        </div>
      ),
      SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

const initialData = {
  results: [
    {
      id: 'flag-1',
      post_id: null,
      topic_id: null,
      hostname_id: null,
      rss_feed_item_id: null,
      entity_relation_id: null,
      agent_moderation_id: null,
      flag_type: 'velocity_spike',
      details: {},
      resolved_at: null,
      resolved_by_id: null,
      resolution: null,
      created_at: '2024-01-01T00:00:00Z',
    },
  ],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
} satisfies Parameters<typeof VoteIntegrityFlagsClient>[0]['initialData']

describe('VoteIntegrityFlagsClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates the status selector immediately when changing filters', async () => {
    const { container } = render(
      <VoteIntegrityFlagsClient
        initialData={initialData}
        initialStatus='pending'
      />,
    )

    expect(screen.getByText('Filter: pending')).toBeInTheDocument()

    const selector = screen.getByText('Filter: pending').parentElement
    if (!selector) {
      throw new Error('Expected selector container')
    }

    await act(async () => {
      fireEvent.click(within(selector).getByRole('button', { name: 'set resolved' }))
    })

    expect(screen.getByText('Filter: resolved')).toBeInTheDocument()
    expect(mockReplace).toHaveBeenCalledWith('/vote-integrity/flags?status=resolved')
    expect(container.firstElementChild?.className).not.toMatch(
      /(?:^|\s)(?:mx-auto|max-w-\S+|p-8)(?:\s|$)/,
    )
  })

  it('uses the server-provided status after navigation completes', async () => {
    const { rerender } = render(
      <VoteIntegrityFlagsClient
        initialData={initialData}
        initialStatus='pending'
      />,
    )

    expect(screen.getByText('Filter: pending')).toBeInTheDocument()

    const selector = screen.getByText('Filter: pending').parentElement
    if (!selector) {
      throw new Error('Expected selector container')
    }

    await act(async () => {
      fireEvent.click(within(selector).getByRole('button', { name: 'set resolved' }))
    })

    expect(screen.getByText('Filter: resolved')).toBeInTheDocument()

    rerender(
      <VoteIntegrityFlagsClient
        initialData={initialData}
        initialStatus='all'
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Filter: all')).toBeInTheDocument()
    })

    rerender(
      <VoteIntegrityFlagsClient
        initialData={initialData}
        initialStatus='pending'
      />,
    )

    expect(screen.getByText('Filter: pending')).toBeInTheDocument()
  })
})
