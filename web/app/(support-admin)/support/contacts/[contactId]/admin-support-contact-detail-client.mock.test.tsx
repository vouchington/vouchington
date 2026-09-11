import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { SUPPORT_DETAIL_PAGE_SIZE } from '@/lib/api/support-detail-page-size'
import type {
  SupportContactDetailResponse,
  SupportThread,
  SupportThreadsResponse,
} from '@/types/support'
import { AdminSupportContactDetailClient } from './admin-support-contact-detail-client'

vi.mock(import('@/hooks/use-paginated-list'), () => ({
  usePaginatedList: vi.fn<VitestLooseMock>(),
}))
vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href }: { children: ReactNode; href: string }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)
vi.mock(import('../../support-thread-status-badge'), () => ({
  SupportThreadStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}))

function thread(id: string): SupportThread {
  return {
    id,
    support_contact_id: 'contact-1',
    contact_user_id: null,
    subject: id,
    conversation_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    assigned_at: null,
    assigned_to_id: null,
    resolved_at: null,
    resolved_by_id: null,
    status: 'open',
  }
}

const initialData: SupportContactDetailResponse = {
  contact: {
    id: 'contact-1',
    email_address: 'tests+staff-support-contact@voucha.ai',
    name: 'Person',
    user_id: null,
    notes: '',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  threads: [thread('newer')],
  thread_page_info: { has_next_page: true, end_cursor: 'older', start_cursor: 'newer' },
}

describe('AdminSupportContactDetailClient', () => {
  it('renders accumulated threads and loads the next page', () => {
    const loadMore = vi.fn<VitestLooseMock>()
    vi.mocked(usePaginatedList<SupportThreadsResponse>).mockReturnValue({
      pages: [
        { results: [thread('newer')], page_info: initialData.thread_page_info },
        {
          results: [thread('older')],
          page_info: { has_next_page: false, end_cursor: null, start_cursor: 'older' },
        },
      ],
      hasNextPage: true,
      endCursor: 'older',
      loadMore,
      loadingMore: false,
      fetchError: null,
      clearError: vi.fn<VitestLooseMock>(),
      resetKey: Symbol('threads'),
    } as ReturnType<typeof usePaginatedList<SupportThreadsResponse>>)
    render(<AdminSupportContactDetailClient initialData={initialData} />)
    expect(vi.mocked(usePaginatedList)).toHaveBeenCalledWith(
      expect.any(Object),
      '/api/v1/support/contacts/contact-1',
      { limit: SUPPORT_DETAIL_PAGE_SIZE },
      expect.any(Object),
    )
    expect(screen.getByText('newer')).toBeDefined()
    expect(screen.getByText('older')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Load older threads' }))
    expect(loadMore).toHaveBeenCalledOnce()
  })
})
