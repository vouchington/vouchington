import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebCrmContact } from '@/types/crm'

const {
  mockGetAdminCrmContact,
  mockGetAdminCrmContactEmails,
  mockGetAdminCrmContactNotes,
  mockNotFound,
} = vi.hoisted(() => ({
  mockGetAdminCrmContact: vi.fn<VitestLooseMock>(),
  mockGetAdminCrmContactEmails: vi.fn<VitestLooseMock>(),
  mockGetAdminCrmContactNotes: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: mockNotFound,
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/server/crm'), () => ({
  getAdminCrmContact: mockGetAdminCrmContact,
  getAdminCrmContactEmails: mockGetAdminCrmContactEmails,
  getAdminCrmContactNotes: mockGetAdminCrmContactNotes,
}))

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav data-testid='breadcrumbs' />,
}))

vi.mock(
  import('./crm-contact-detail-client'),
  () =>
    ({
      CrmContactDetailClient: () => null,
    }) as unknown as typeof import('./crm-contact-detail-client'),
)

import CrmContactPage from './page'
import { CrmContactDetailClient } from './crm-contact-detail-client'

function findElementByType(node: ReactNode, type: unknown): ReactElement | null {
  if (!isValidElement(node)) return null
  if (node.type === type) return node

  const { children } = node.props as { children?: ReactNode }
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findElementByType(child, type)
      if (found) return found
    }
    return null
  }

  return findElementByType(children, type)
}

const baseContact: WebCrmContact = {
  id: 'contact-1',
  name: 'Alice',
  email: 'tests+alice@voucha.ai',
  phone: null,
  vertical: null,
  follower_count: null,
  notes: null,
  user_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  status: 'new',
  status_changed_at: null,
} as unknown as WebCrmContact

describe('CrmContactPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAdminCrmContactEmails.mockResolvedValue({ results: [] })
    mockGetAdminCrmContactNotes.mockResolvedValue({ results: [] })
  })

  it('keys the client page by contact id so route changes reset client state', async () => {
    mockGetAdminCrmContact.mockResolvedValue({
      contact: baseContact,
      social_accounts: [],
    })

    const result = await CrmContactPage({
      params: Promise.resolve({ contactId: 'contact-1' }),
    })

    const client = findElementByType(result, CrmContactDetailClient)
    expect(client?.key).toBe('contact-1')
  })
})
