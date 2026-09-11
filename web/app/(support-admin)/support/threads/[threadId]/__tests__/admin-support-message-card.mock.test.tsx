import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { approveAdminSupportMessage, sendAdminSupportMessage } from '@/lib/api/client/support'
import type { SupportMessage } from '@/types/support'
import { AdminSupportMessageCard } from '../admin-support-message-card'

vi.mock(import('@/lib/api/client/support'), () => ({
  patchAdminSupportMessage: vi.fn<VitestLooseMock>(),
  approveAdminSupportMessage: vi.fn<VitestLooseMock>(),
  sendAdminSupportMessage: vi.fn<VitestLooseMock>(),
}))

function message(overrides: Partial<SupportMessage> = {}): SupportMessage {
  return {
    id: 'message-1',
    support_thread_id: 'thread-1',
    direction: 'outbound',
    body_text: 'Draft',
    body_html: '',
    created_at: '2024-01-01T00:00:00Z',
    created_by_id: null,
    updated_at: '2024-01-01T00:00:00Z',
    email_message_id: null,
    email_subject: null,
    email_from: null,
    email_to: null,
    drafted_at: '2024-01-01T00:00:00Z',
    edited_at: null,
    edited_by_id: null,
    approved_at: null,
    approved_by_id: null,
    sent_at: null,
    ...overrides,
  }
}

describe('AdminSupportMessageCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not offer Send until a draft is approved', () => {
    render(
      <AdminSupportMessageCard
        message={message()}
        threadId='thread-1'
        onMessageUpdate={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDefined()
  })

  it('requires confirmation before approving a draft', async () => {
    vi.mocked(approveAdminSupportMessage).mockResolvedValue({
      message: message({ approved_at: '2024-01-02T00:00:00Z' }),
    })
    render(
      <AdminSupportMessageCard
        message={message()}
        threadId='thread-1'
        onMessageUpdate={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(approveAdminSupportMessage).not.toHaveBeenCalled()
    fireEvent.click(
      screen
        .getByRole('alertdialog')
        .querySelector('[data-pw="support-action-confirmation-confirm"]')!,
    )
    await waitFor(() => expect(approveAdminSupportMessage).toHaveBeenCalledOnce())
  })

  it('does not expose edit or approval controls for a resolved thread', () => {
    render(
      <AdminSupportMessageCard
        message={message()}
        threadId='thread-1'
        threadResolved
        onMessageUpdate={() => {}}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('removes an in-progress draft editor when the thread becomes resolved', () => {
    const { rerender } = render(
      <AdminSupportMessageCard
        message={message()}
        threadId='thread-1'
        onMessageUpdate={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('textbox')).toBeDefined()

    rerender(
      <AdminSupportMessageCard
        message={message()}
        threadId='thread-1'
        threadResolved
        onMessageUpdate={() => {}}
      />,
    )

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('hides approval until edited draft text is saved', () => {
    render(
      <AdminSupportMessageCard
        message={message()}
        threadId='thread-1'
        onMessageUpdate={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Unsaved revision' } })
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('refreshes server state after an ambiguous send failure', async () => {
    const refresh = vi.fn<() => Promise<void>>().mockResolvedValue()
    vi.mocked(sendAdminSupportMessage).mockRejectedValue(new Error('network'))
    render(
      <AdminSupportMessageCard
        message={message({ approved_at: '2024-01-02T00:00:00Z' })}
        threadId='thread-1'
        onMessageUpdate={() => {}}
        onRefreshMessages={refresh}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    fireEvent.click(
      screen
        .getByRole('alertdialog')
        .querySelector('[data-pw="support-action-confirmation-confirm"]')!,
    )
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
  })
})
