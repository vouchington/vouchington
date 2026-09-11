import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { getAdminSupportContactClient } from '@/lib/api/client/support'
import type { SupportContactDetailResponse, SupportThread } from '@/types/support'
import { AdminSupportContactDetailClient } from '../admin-support-contact-detail-client'

vi.mock(import('@/lib/api/client/support'), () => ({
  getAdminSupportContactClient: vi.fn<VitestLooseMock>(),
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
vi.mock(import('../../../support-thread-status-badge'), () => ({
  SupportThreadStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}))

function makeThread(id: string): SupportThread {
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

function makeInitialData(): SupportContactDetailResponse {
  return {
    contact: {
      id: 'contact-1',
      email_address: 'tests+staff-support-contact@voucha.ai',
      name: 'Person',
      user_id: null,
      notes: '',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    threads: [makeThread('newer')],
    thread_page_info: { has_next_page: true, end_cursor: 'older', start_cursor: 'newer' },
  }
}

describe('AdminSupportContactDetailClient pagination', () => {
  it('retains loaded threads through a local component rerender', async () => {
    const initialData = makeInitialData()
    vi.mocked(getAdminSupportContactClient).mockResolvedValue({
      contact: initialData.contact,
      threads: [makeThread('older')],
      thread_page_info: { has_next_page: false, end_cursor: null, start_cursor: 'older' },
    })
    const { rerender } = render(<AdminSupportContactDetailClient initialData={initialData} />)

    fireEvent.click(screen.getByRole('button', { name: 'Load older threads' }))
    expect(await screen.findByText('older')).toBeDefined()
    rerender(<AdminSupportContactDetailClient initialData={initialData} />)

    await waitFor(() => expect(screen.getByText('older')).toBeDefined())
  })
})
