import { fireEvent, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import type {
  CommunityModerationReport,
  CommunityModerationReportsResponseBody,
} from '@/types/api-responses'

const mockNav = createNavMock()

const { mockConfirmCommunityBanEvasion, mockUsePaginatedList } = vi.hoisted(() => ({
  mockConfirmCommunityBanEvasion: vi.fn<() => Promise<void>>(),
  mockUsePaginatedList: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        children,
        onValueChange,
        value,
      }: {
        children: ReactNode
        onValueChange: (value: string) => void
        value: string
      }) => (
        <select
          aria-label='Sort reports'
          value={value}
          onChange={event => onValueChange(event.currentTarget.value)}
        >
          {children}
        </select>
      ),
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
        <option value={value}>{children}</option>
      ),
      SelectTrigger: ({ children }: { children: ReactNode }) => children,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

vi.mock(import('@/hooks/use-paginated-list'), () => ({
  usePaginatedList: mockUsePaginatedList,
}))

vi.mock(import('@/lib/api/client'), () => ({
  approvePost: vi.fn<VitestLooseMock>(),
  rejectPost: vi.fn<VitestLooseMock>(),
  unpublishCommunityPost: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/reports'), () => ({
  resolveCommunityModerationReport: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/community-ban-evasion'), () => ({
  confirmCommunityBanEvasion: mockConfirmCommunityBanEvasion,
  dismissCommunityBanEvasion: vi.fn<() => Promise<void>>(),
}))

import { ModQueue } from '../mod-queue'

describe('ModQueue ban-evasion action', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
  })

  it('calls handleBanEvasionAction (clearSelected) after ban-evasion confirm', async () => {
    const emptyPosts = {
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      posts: {},
      posts_metrics: {},
    }
    mockUsePaginatedList.mockReturnValue({
      pages: [emptyPosts],
      hasNextPage: false,
      endCursor: null,
      loadMore: vi.fn<() => void>(),
      fetchError: null,
      clearError: vi.fn<() => void>(),
    })
    mockConfirmCommunityBanEvasion.mockResolvedValueOnce(undefined)

    const report: CommunityModerationReport = {
      id: 'report-ban',
      created_at: '2026-05-31T00:00:00.000Z',
      reviewed_at: null,
      entity_type: 'user',
      entity_id: 'user-suspect',
      admin_action_path: null,
      target_content: null,
      target_label: '@new-account',
      target_path: '/user/new-account',
      reason: 'other',
      note: null,
      status: 'pending',
      report_count: 1,
      resolved_by_id: null,
      community_ban_evasion: {
        community_id: 'community-1',
        community_slug: 'test-community',
        source_user_id: 'source-user-1',
        source_username: 'banned-user',
        score: 0.82,
        flagged_at: '2026-05-31T06:30:00.000Z',
      },
    }
    const reportsData: CommunityModerationReportsResponseBody = { reports: [report] }

    const { container } = render(
      <ModQueue
        data={emptyPosts}
        reportsData={reportsData}
        communitySlug='credit-cards'
      />,
    )

    fireEvent.click(container.querySelector('[data-pw="community-ban-evasion-confirm"]')!)
    await waitFor(() =>
      expect(mockConfirmCommunityBanEvasion).toHaveBeenCalledWith('community-1', 'user-suspect'),
    )
  })
})
