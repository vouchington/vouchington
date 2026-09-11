import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { CrmEmailComposeDialog } from '../crm-email-compose-dialog'
import { sendCrmEmail } from '@/lib/api/client/crm'

vi.mock(import('@/lib/api/client/crm'), () => ({
  sendCrmEmail: vi.fn<VitestLooseMock>(),
}))

const { toastMock } = vi.hoisted(() => {
  const mock = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
  })
  return { toastMock: mock }
})

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: toastMock,
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/on-error'), () => ({
  default: (err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

const mockSend = vi.mocked(sendCrmEmail)

describe('CrmEmailComposeDialog error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports send-email failures via onError fallback', async () => {
    mockSend.mockRejectedValueOnce(new Error('Send failed'))

    render(
      <CrmEmailComposeDialog
        contactId='contact-1'
        initialDraft={{ subject: 'Hello', body_text: 'Body' } as never}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /compose email/i }))
    await screen.findByLabelText('Subject')
    fireEvent.click(screen.getByRole('button', { name: /send email/i }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to send email')
    })
  })
})
