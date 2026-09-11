import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SupportThread } from '@/types/support'
import { AdminSupportThreadHeader } from './admin-support-thread-header'

vi.mock(import('../../support-thread-status-badge'), () => ({
  SupportThreadStatusBadge: () => <span>Status</span>,
}))
vi.mock(import('./support-action-confirmation-dialog'), () => ({
  SupportActionConfirmationDialog: () => <div />,
}))

function makeThread(status: SupportThread['status']): SupportThread {
  return {
    id: 'thread-1',
    support_contact_id: 'contact-1',
    subject: 'Test support request',
    conversation_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    assigned_at: null,
    assigned_to_id: null,
    resolved_at: status === 'resolved' ? '2024-01-02T00:00:00Z' : null,
    resolved_by_id: null,
    status,
  }
}

describe('AdminSupportThreadHeader', () => {
  it('only offers assignment while the thread is open', () => {
    const props = {
      actionError: null,
      actionLoading: null,
      handleAssignToMe: () => {},
      handleReopen: () => {},
      handleResolve: () => {},
    }
    const { rerender } = render(
      <AdminSupportThreadHeader
        {...props}
        thread={makeThread('open')}
      />,
    )
    expect(screen.getByRole('button', { name: /assign to me/i })).toBeDefined()

    rerender(
      <AdminSupportThreadHeader
        {...props}
        thread={makeThread('assigned')}
      />,
    )
    expect(screen.queryByRole('button', { name: /assign to me/i })).toBeNull()

    rerender(
      <AdminSupportThreadHeader
        {...props}
        thread={makeThread('resolved')}
      />,
    )
    expect(screen.queryByRole('button', { name: /assign to me/i })).toBeNull()
  })
})
