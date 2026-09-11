import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { SupportContactDetailResponse } from '@/types/support'
import { SUPPORT_DETAIL_PAGE_SIZE } from '@/lib/api/support-detail-page-size'

const { mockGetAdminSupportContact, mockNotFound } = vi.hoisted(() => ({
  mockGetAdminSupportContact: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('not-found')
  }),
}))

vi.mock(
  import('next/navigation'),
  () => ({ notFound: mockNotFound }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/server'), () => ({ getAdminSupportContact: mockGetAdminSupportContact }))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({ noIndex: true })),
}))
vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav data-testid='breadcrumbs' />,
}))
vi.mock(import('./admin-support-contact-detail-client'), () => ({
  AdminSupportContactDetailClient: ({
    initialData,
  }: {
    initialData: SupportContactDetailResponse
  }) => <div>{initialData.contact.email_address}</div>,
}))

import AdminSupportContactPage from './page'

const contact = {
  id: 'contact-1',
  email_address: 'tests+support@voucha.ai',
  name: 'Support Contact',
  user_id: null,
  notes: '',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

const thread = {
  id: 'thread-1',
  support_contact_id: 'contact-1',
  contact_user_id: null,
  subject: 'Existing support thread',
  conversation_id: null,
  created_at: '2026-01-02T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  assigned_at: null,
  assigned_to_id: null,
  resolved_at: null,
  resolved_by_id: null,
  status: 'open',
}

describe('AdminSupportContactPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the contact detail client with the first thread page', async () => {
    mockGetAdminSupportContact.mockResolvedValue({
      contact,
      threads: [thread],
      thread_page_info: { has_next_page: true, end_cursor: 'thread-1', start_cursor: 'thread-1' },
    })

    const result = await AdminSupportContactPage({
      params: Promise.resolve({ contactId: 'contact-1' }),
    })
    render(result)

    expect(screen.getByText('tests+support@voucha.ai')).toBeDefined()
    expect(mockGetAdminSupportContact).toHaveBeenCalledWith('contact-1', {
      limit: SUPPORT_DETAIL_PAGE_SIZE,
    })
  })

  it('shows not found for missing contacts', async () => {
    mockGetAdminSupportContact.mockResolvedValue(null)

    await expect(
      AdminSupportContactPage({
        params: Promise.resolve({ contactId: 'missing' }),
      }),
    ).rejects.toThrow('not-found')
  })
})
