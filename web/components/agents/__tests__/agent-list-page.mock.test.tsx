import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { AgentListPage } from '../agent-list-page'
import type { AgentsResponseBody } from '@/types/agents'
import { getPaginatedPage } from '@/lib/api/client'

const mockReceiveLoadMore = vi.fn<VitestLooseMock>()

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({
    children,
    onLoadMore,
  }: {
    children: ReactNode
    hasNextPage: boolean
    endCursor: string | null
    onLoadMore: () => Promise<void | boolean>
    resetKey?: unknown
  }) => {
    mockReceiveLoadMore(onLoadMore)
    return <div>{children}</div>
  },
}))

vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: ReactNode
        href: string
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

function makePage(
  id: string,
  name: string,
  hasNextPage: boolean,
  endCursor: string | null,
): AgentsResponseBody {
  return {
    results: [
      {
        id,
        system_user_id: `user-${id}`,
        agent_type: 'moderator',
        activated_at: '2024-01-15T10:00:00Z',
        deactivated_at: null,
        created_at: '2024-01-15T10:00:00Z',
      },
    ],
    users: {
      [`user-${id}`]: {
        id: `user-${id}`,
        username: name,
      },
    },
    page_info: { has_next_page: hasNextPage, end_cursor: endCursor, start_cursor: null },
  }
}

describe('AgentListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders initial agents', () => {
    render(<AgentListPage data={makePage('agent-1', 'First Agent', false, null)} />)
    expect(screen.getByText('First Agent')).toBeInTheDocument()
  })

  it('appends agents from the next cursor page', async () => {
    vi.mocked(getPaginatedPage).mockResolvedValueOnce(
      makePage('agent-2', 'Second Agent', false, null),
    )

    render(<AgentListPage data={makePage('agent-1', 'First Agent', true, 'cursor-1')} />)

    const loadMore = mockReceiveLoadMore.mock.calls.at(-1)![0] as () => Promise<void>
    await act(async () => {
      await loadMore()
    })

    expect(screen.getByText('Second Agent')).toBeInTheDocument()
    expect(getPaginatedPage).toHaveBeenCalledWith('/api/v1/agents', {
      limit: 25,
      after: 'cursor-1',
    })
  })
})
