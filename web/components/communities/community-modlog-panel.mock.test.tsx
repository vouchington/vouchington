import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommunityModlogPanel } from './community-modlog-panel'
import type { Community, ModlogResponseBody } from '@/types/api-responses'

const fetchModlogMock = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(import('@/lib/api/client'), () => ({
  fetchCommunityModlog: fetchModlogMock,
}))

vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({
        children,
        onClick,
        disabled,
      }: {
        children: ReactNode
        onClick?: () => void
        disabled?: boolean
      }) => (
        <button
          type='button'
          onClick={onClick}
          disabled={disabled}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/button'),
)

vi.mock(
  import('@/components/ui/card'),
  () =>
    ({
      Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      CardDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
      CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      CardTitle: ({ children, ...props }: { children: ReactNode; [k: string]: unknown }) => (
        <h2 {...props}>{children}</h2>
      ),
    }) as unknown as typeof import('@/components/ui/card'),
)

const community = { id: 'c-1', slug: 'test-community', name: 'Test' } as Community

const action1 = {
  id: 'a-1',
  community_id: 'c-1',
  actor_id: 'u-1',
  action_type: 'ban' as const,
  post_id: null,
  target_user_id: 'u-2',
  report_id: null,
  review_dispute_id: null,
  community_application_id: null,
  reason: 'Spam',
  metadata: {},
  created_at: '2026-06-01T10:00:00.000Z',
}

const dataWithAction: ModlogResponseBody = {
  results: [{ __entity_type: 'moderator_action', id: 'a-1' }],
  page_info: { has_next_page: true, end_cursor: 'cursor-1', start_cursor: 'a-1' },
  moderator_actions: { 'a-1': action1 },
  users: {},
}

const emptyData: ModlogResponseBody = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  moderator_actions: {},
  users: {},
}

describe('CommunityModlogPanel', () => {
  beforeEach(() => {
    fetchModlogMock.mockReset()
  })

  it('renders heading', () => {
    render(
      <CommunityModlogPanel
        community={community}
        initialData={emptyData}
      />,
    )
    expect(screen.getByText('Moderator Action Log')).toBeDefined()
  })

  it('renders empty state', () => {
    const { container } = render(
      <CommunityModlogPanel
        community={community}
        initialData={emptyData}
      />,
    )
    expect(container.querySelector('[data-pw="community-modlog-empty"]')).toBeTruthy()
  })

  it('renders action rows with data', () => {
    const { container } = render(
      <CommunityModlogPanel
        community={community}
        initialData={{
          ...dataWithAction,
          page_info: { ...dataWithAction.page_info, has_next_page: false },
        }}
      />,
    )
    expect(container.querySelector('[data-pw="community-modlog-row"]')).toBeTruthy()
    expect(screen.getByText('ban')).toBeDefined()
    expect(screen.getByText('Spam')).toBeDefined()
  })

  it('loads more actions when Load more button is clicked', async () => {
    const page2Data: ModlogResponseBody = {
      results: [{ __entity_type: 'moderator_action', id: 'a-2' }],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: 'a-2' },
      moderator_actions: {
        'a-2': { ...action1, id: 'a-2', action_type: 'lock', reason: null },
      },
      users: {},
    }
    fetchModlogMock.mockResolvedValue(page2Data)

    render(
      <CommunityModlogPanel
        community={community}
        initialData={dataWithAction}
      />,
    )

    const loadMoreBtn = screen.getByText('Load more')
    fireEvent.click(loadMoreBtn)

    await waitFor(() => {
      expect(fetchModlogMock).toHaveBeenCalledWith('test-community', 'cursor-1')
    })
  })

  it('shows error message when load more fails', async () => {
    fetchModlogMock.mockRejectedValue(new Error('Network error'))

    render(
      <CommunityModlogPanel
        community={community}
        initialData={dataWithAction}
      />,
    )

    fireEvent.click(screen.getByText('Load more'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load more')
    })
  })
})
