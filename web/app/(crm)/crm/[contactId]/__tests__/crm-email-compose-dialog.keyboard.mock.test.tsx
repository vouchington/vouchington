import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  expectInputEnterSubmits,
  expectTextareaCmdEnterSubmits,
} from '@/test-helpers/form-keyboard'
import { CrmEmailComposeDialog } from '../crm-email-compose-dialog'
import { sendCrmEmail } from '@/lib/api/client/crm'

vi.mock(import('@/lib/api/client/crm'), () => ({
  sendCrmEmail: vi.fn<VitestLooseMock>(),
}))

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
        onValueChange?: (value: string) => void
        value?: string
      }) => (
        <select
          aria-label='Provider'
          value={value}
          onChange={event => onValueChange?.(event.target.value)}
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

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { success: vi.fn<VitestLooseMock>(), error: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

const mockSendCrmEmail = vi.mocked(sendCrmEmail)

describe('CrmEmailComposeDialog — keyboard submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendCrmEmail.mockResolvedValue({
      message: {
        id: 'msg-1',
      },
    } as Awaited<ReturnType<typeof sendCrmEmail>>)
  })

  function openDialogAndFill() {
    render(<CrmEmailComposeDialog contactId='contact-1' />)
    fireEvent.click(screen.getByRole('button', { name: /Compose Email/i }))
  }

  it('Enter on the subject input submits via sendCrmEmail', async () => {
    openDialogAndFill()

    const subject = (await screen.findByLabelText('Subject')) as HTMLInputElement
    fireEvent.change(subject, { target: { value: 'Hello' } })
    const body = screen.getByLabelText('Body') as HTMLTextAreaElement
    fireEvent.change(body, { target: { value: 'Body text' } })

    void expectInputEnterSubmits({ input: subject, onSubmit: mockSendCrmEmail })

    await waitFor(() => {
      expect(mockSendCrmEmail).toHaveBeenCalled()
    })
  })

  it('Cmd+Enter and Ctrl+Enter on the body textarea submit; plain Enter does not', async () => {
    openDialogAndFill()

    const subject = (await screen.findByLabelText('Subject')) as HTMLInputElement
    fireEvent.change(subject, { target: { value: 'Hello' } })
    const body = screen.getByLabelText('Body') as HTMLTextAreaElement
    fireEvent.change(body, { target: { value: 'Body text' } })

    // Spy on the native submit event because the form's React onSubmit short-circuits
    // re-entry (sending state) between the three keydowns.
    const onSubmit = vi.fn<VitestLooseMock>()
    body.form!.addEventListener('submit', onSubmit)
    expectTextareaCmdEnterSubmits({ textarea: body, onSubmit })
  })
})
