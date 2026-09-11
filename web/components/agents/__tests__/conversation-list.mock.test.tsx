import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import type { AgentConversationsResponseBody } from '@/types/agents'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { ConversationList } from '../conversation-list'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => (
        <button
          type='button'
          {...props}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/button'),
)

vi.mock(
  import('@/components/ui/input'),
  () =>
    ({
      Input: (props: Record<string, unknown>) => <input {...props} />,
    }) as unknown as typeof import('@/components/ui/input'),
)

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

vi.mock(import('@/hooks/use-paginated-list'), () => ({
  usePaginatedList: vi.fn<VitestLooseMock>(),
}))

const mockNav = createNavMock()

function makeInitialData(): AgentConversationsResponseBody {
  return {
    results: [],
    users: {},
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  }
}

describe('ConversationList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
    mockNav.setSearchParams('username=&user_id=&post_id=&post_slug=&rss_feed_item_id=')
    const initialData = makeInitialData()
    vi.mocked(usePaginatedList).mockReturnValue({
      pages: [initialData],
      hasNextPage: false,
      loadingMore: false,
      endCursor: null,
      loadMore: vi.fn<VitestLooseMock>(),
      fetchError: null,
      clearError: vi.fn<VitestLooseMock>(),
      resetKey: Symbol('conversations'),
    })
  })

  it('submits the search via Enter on the search input', () => {
    const initialData = makeInitialData()
    render(
      <ConversationList
        data={initialData}
        agentIdOrSlug='agent-123'
      />,
    )

    const input = screen.getByPlaceholderText('Search conversations...') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'alice' } })

    void expectInputEnterSubmits({ input, onSubmit: mockNav.push })
    expect(mockNav.push).toHaveBeenCalledWith('/agent/agent-123?username=alice')
  })

  it('navigates back to the agent page when submitting an empty search', () => {
    const initialData = makeInitialData()
    render(
      <ConversationList
        data={initialData}
        agentIdOrSlug='agent-123'
      />,
    )

    const input = screen.getByPlaceholderText('Search conversations...') as HTMLInputElement
    fireEvent.change(input, { target: { value: '   ' } })

    void expectInputEnterSubmits({ input, onSubmit: mockNav.push })
    expect(mockNav.push).toHaveBeenCalledWith('/agent/agent-123')
  })

  it('normalizes empty query params before requesting the next page', () => {
    const initialData = makeInitialData()
    render(
      <ConversationList
        data={initialData}
        agentIdOrSlug='agent-123'
      />,
    )

    expect(screen.getByText('No conversations found.')).toBeInTheDocument()
    expect(usePaginatedList).toHaveBeenCalledWith(
      initialData,
      '/api/v1/agents/agent-123/conversations',
      {
        limit: 25,
        username: undefined,
        user_id: undefined,
        post_id: undefined,
        post_slug: undefined,
        rss_feed_item_id: undefined,
      },
    )
  })
})
